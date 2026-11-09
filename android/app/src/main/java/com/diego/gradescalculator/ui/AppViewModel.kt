package com.diego.gradescalculator.ui

import android.app.Application
import android.content.ContentResolver
import android.net.Uri
import androidx.appcompat.app.AppCompatDelegate
import androidx.core.os.LocaleListCompat
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.diego.gradescalculator.calc.Evaluation
import com.diego.gradescalculator.calc.Scale
import com.diego.gradescalculator.calc.mergeClasses
import com.diego.gradescalculator.data.Api
import com.diego.gradescalculator.data.ApiException
import com.diego.gradescalculator.data.AppData
import com.diego.gradescalculator.data.BackupFile
import com.diego.gradescalculator.data.LocalStore
import com.diego.gradescalculator.data.StoredClass
import com.diego.gradescalculator.data.SyncAccount
import com.diego.gradescalculator.data.SyncBody
import com.diego.gradescalculator.data.SyncedSettings
import com.diego.gradescalculator.data.json
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.time.Instant
import java.util.UUID

enum class Screen { Classes, Settings }

sealed interface SyncState {
    data object Idle : SyncState
    data object Syncing : SyncState
    data class Error(val code: String) : SyncState
}

/** One-off feedback shown in Settings; [code] maps to a string resource. */
data class Message(val code: String, val isError: Boolean, val arg: Int = 0)

data class UiState(
    val loading: Boolean = true,
    val data: AppData = AppData(),
    val selectedId: String? = null,
    val screen: Screen = Screen.Classes,
    val sync: SyncState = SyncState.Idle,
    val busy: Boolean = false,
    val message: Message? = null,
) {
    /** Classes that are not deleted, in display order. */
    val classes: List<StoredClass> get() = data.classes.filter { !it.deleted }
    val selected: StoredClass? get() = classes.find { it.id == selectedId } ?: classes.firstOrNull()
    val scale: Scale get() = data.scale
}

class AppViewModel(app: Application) : AndroidViewModel(app) {
    private val store = LocalStore(app)
    private var syncJob: Job? = null
    private var lastStamp = 0L

    private val _state = MutableStateFlow(UiState())
    val state: StateFlow<UiState> = _state

    init {
        viewModelScope.launch {
            val data = store.load()
            _state.update { it.copy(loading = false, data = data) }
            syncNow()
        }
    }

    /** Monotonic timestamp so two quick edits never share an updatedAt. */
    private fun stamp(): Long {
        lastStamp = maxOf(System.currentTimeMillis(), lastStamp + 1)
        return lastStamp
    }

    private fun save() {
        val data = _state.value.data
        viewModelScope.launch { store.save(data) }
    }

    /** Applies a local data change, saves it and schedules a sync if signed in. */
    private fun change(transform: (AppData) -> AppData) {
        _state.update { it.copy(data = transform(it.data)) }
        save()
        if (_state.value.data.account != null) {
            syncJob?.cancel()
            syncJob = viewModelScope.launch {
                delay(1500)
                syncNow()
            }
        }
    }

    fun applyLocale(locale: String?) {
        val list = if (locale == null) LocaleListCompat.getEmptyLocaleList() else LocaleListCompat.forLanguageTags(locale)
        if (AppCompatDelegate.getApplicationLocales() != list) AppCompatDelegate.setApplicationLocales(list)
    }

    fun currentLocaleTag(): String? = AppCompatDelegate.getApplicationLocales().takeIf { !it.isEmpty }?.get(0)?.language

    fun select(id: String) = _state.update { it.copy(selectedId = id) }
    fun show(screen: Screen) = _state.update { it.copy(screen = screen, message = null) }
    fun clearMessage() = _state.update { it.copy(message = null) }

    fun createClass(name: String) {
        val cls = StoredClass(
            id = UUID.randomUUID().toString(), name = name, examWeight = 30.0,
            minExamGrade = _state.value.scale.pass, updatedAt = stamp(),
        )
        change { it.copy(classes = it.classes + cls) }
        _state.update { it.copy(selectedId = cls.id) }
    }

    fun deleteSelected() {
        val id = _state.value.selected?.id ?: return
        change { d -> d.copy(classes = d.classes.map { if (it.id == id) it.copy(deleted = true, updatedAt = stamp()) else it }) }
        _state.update { it.copy(selectedId = null) }
    }

    /** Applies an edit to the selected class. */
    fun edit(transform: (StoredClass) -> StoredClass) {
        val id = _state.value.selected?.id ?: return
        change { d -> d.copy(classes = d.classes.map { if (it.id == id) transform(it).copy(updatedAt = stamp()) else it }) }
    }

    fun editItems(transform: (List<Evaluation>) -> List<Evaluation>) = edit { it.copy(items = transform(it.items)) }

    fun saveScale(scale: Scale) {
        if (!scale.isValid) {
            _state.update { it.copy(message = Message("INVALID_SCALE", isError = true)) }
            return
        }
        change { it.copy(scale = scale, scaleUpdatedAt = stamp()) }
        _state.update { it.copy(message = Message("SETTINGS_SAVED", isError = false)) }
    }

    // MARK: Sync

    fun signIn(serverUrl: String, email: String, password: String, register: Boolean) {
        viewModelScope.launch {
            _state.update { it.copy(busy = true, message = null) }
            try {
                val url = serverUrl.trim()
                val res = if (register) Api.register(url, email.trim(), password) else Api.login(url, email.trim(), password)
                _state.update { s -> s.copy(data = s.data.copy(account = SyncAccount(url, res.user.email, res.token))) }
                save()
                syncNow()
            } catch (e: ApiException) {
                _state.update { it.copy(message = Message(e.code, isError = true)) }
            } finally {
                _state.update { it.copy(busy = false) }
            }
        }
    }

    fun signOut() {
        syncJob?.cancel()
        _state.update { it.copy(data = it.data.copy(account = null), sync = SyncState.Idle) }
        save()
    }

    fun syncNow() {
        val account = _state.value.data.account ?: return
        if (_state.value.sync == SyncState.Syncing) return
        viewModelScope.launch {
            _state.update { it.copy(sync = SyncState.Syncing) }
            try {
                val snapshot = _state.value.data
                val res = Api.sync(
                    account.serverUrl, account.token,
                    SyncBody(snapshot.classes, SyncedSettings(snapshot.scale, snapshot.scaleUpdatedAt)),
                )
                // Merge into the current state so edits made during the request are kept.
                _state.update { s ->
                    val d = s.data
                    val remoteScaleNewer = res.settings.scaleUpdatedAt > d.scaleUpdatedAt
                    s.copy(
                        sync = SyncState.Idle,
                        data = d.copy(
                            classes = mergeClasses(d.classes, res.classes),
                            scale = if (remoteScaleNewer) res.settings.scale else d.scale,
                            scaleUpdatedAt = maxOf(d.scaleUpdatedAt, res.settings.scaleUpdatedAt),
                            account = d.account?.copy(lastSyncAt = System.currentTimeMillis()),
                        ),
                    )
                }
                save()
            } catch (e: ApiException) {
                _state.update { s ->
                    s.copy(
                        sync = SyncState.Error(e.code),
                        data = if (e.status == 401) s.data.copy(account = null) else s.data,
                    )
                }
                if (e.status == 401) save()
            }
        }
    }

    // MARK: Backup

    fun exportTo(resolver: ContentResolver, uri: Uri) {
        viewModelScope.launch {
            val d = _state.value.data
            val file = BackupFile(exportedAt = Instant.now().toString(), scale = d.scale, classes = d.classes.filter { !it.deleted })
            val ok = runCatching {
                withContext(Dispatchers.IO) {
                    resolver.openOutputStream(uri, "wt")!!.use { it.write(json.encodeToString(file).toByteArray()) }
                }
            }.isSuccess
            _state.update { it.copy(message = if (ok) Message("EXPORT_DONE", false) else Message("UNKNOWN", true)) }
        }
    }

    fun importFrom(resolver: ContentResolver, uri: Uri) {
        viewModelScope.launch {
            val backup = runCatching {
                withContext(Dispatchers.IO) {
                    val text = resolver.openInputStream(uri)!!.use { it.readBytes().decodeToString() }
                    json.decodeFromString<BackupFile>(text)
                }
            }.getOrNull()
            if (backup == null || backup.app != "grades-calculator" || !backup.scale.isValid) {
                _state.update { it.copy(message = Message("IMPORT_FAILED", true)) }
                return@launch
            }
            // Imported classes count as fresh edits so they win over local copies and deletions.
            val imported = backup.classes.map { it.copy(deleted = false, updatedAt = stamp()) }
            change { it.copy(classes = mergeClasses(it.classes, imported), scale = backup.scale, scaleUpdatedAt = stamp()) }
            _state.update { it.copy(message = Message("IMPORT_DONE", false, imported.size)) }
        }
    }
}
