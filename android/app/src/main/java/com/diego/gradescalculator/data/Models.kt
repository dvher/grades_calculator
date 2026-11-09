package com.diego.gradescalculator.data

import com.diego.gradescalculator.calc.ClassInput
import com.diego.gradescalculator.calc.Evaluation
import com.diego.gradescalculator.calc.Scale
import com.diego.gradescalculator.calc.Versioned
import kotlinx.serialization.Serializable

/** A class as stored on the device and exchanged with the sync server. */
@Serializable
data class StoredClass(
    override val id: String,
    val name: String,
    override val examWeight: Double,
    override val minExamGrade: Double? = null,
    override val examGrade: Double? = null,
    override val items: List<Evaluation> = emptyList(),
    /** Last local modification, ms since epoch. The newest version wins when syncing. */
    override val updatedAt: Long = 0,
    /** Deleted classes are kept as tombstones so the deletion syncs to other devices. */
    val deleted: Boolean = false,
) : ClassInput, Versioned

@Serializable
data class SyncedSettings(val scale: Scale, val scaleUpdatedAt: Long)

@Serializable
data class SyncAccount(val serverUrl: String, val email: String, val token: String, val lastSyncAt: Long? = null)

/** Everything the app stores, kept in a JSON file in the app's private storage. */
@Serializable
data class AppData(
    val classes: List<StoredClass> = emptyList(),
    val scale: Scale = Scale.DEFAULT,
    val scaleUpdatedAt: Long = 0,
    val account: SyncAccount? = null,
)

@Serializable
data class AuthUser(val id: String, val email: String)

@Serializable
data class AuthResponse(val token: String, val user: AuthUser)

@Serializable
data class Credentials(val email: String, val password: String)

@Serializable
data class SyncBody(val classes: List<StoredClass>, val settings: SyncedSettings)

@Serializable
data class SyncResponse(val classes: List<StoredClass>, val settings: SyncedSettings)

/** Export/import file format, shared with the web and iOS apps. */
@Serializable
data class BackupFile(
    val app: String = "grades-calculator",
    val version: Int = 1,
    val exportedAt: String,
    val scale: Scale,
    val classes: List<StoredClass>,
)

/** [code] is a stable server error code (e.g. EMAIL_TAKEN) or NETWORK / UNKNOWN. */
class ApiException(val code: String, val status: Int) : Exception(code)
