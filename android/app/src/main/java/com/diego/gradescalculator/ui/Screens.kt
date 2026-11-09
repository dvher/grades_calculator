package com.diego.gradescalculator.ui

import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.HorizontalDivider
import androidx.compose.ui.res.pluralStringResource
import androidx.lifecycle.compose.LifecycleResumeEffect
import java.text.DateFormat
import java.time.LocalDate
import java.util.Date
import androidx.annotation.StringRes
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.AssistChip
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExposedDropdownMenuAnchorType
import androidx.compose.material3.ExposedDropdownMenuBox
import androidx.compose.material3.ExposedDropdownMenuDefaults
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.TextRange
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.TextFieldValue
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.diego.gradescalculator.R
import com.diego.gradescalculator.calc.CalcResult
import com.diego.gradescalculator.calc.Evaluation
import com.diego.gradescalculator.calc.Scale
import com.diego.gradescalculator.calc.Status
import com.diego.gradescalculator.calc.WarningCode
import com.diego.gradescalculator.calc.calculate
import com.diego.gradescalculator.data.StoredClass
import kotlin.math.abs

@Composable
fun App(vm: AppViewModel = viewModel()) {
    val state by vm.state.collectAsStateWithLifecycle()
    LifecycleResumeEffect(Unit) {
        vm.syncNow()
        onPauseOrDispose {}
    }
    BackHandler(enabled = state.screen == Screen.Settings) { vm.show(Screen.Classes) }
    Surface(Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
        when {
            state.loading -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
            state.screen == Screen.Settings -> SettingsScreen(state, vm)
            else -> ClassesScreen(state, vm)
        }
    }
}

@Composable
private fun errorText(code: String): String {
    val ctx = LocalContext.current
    val id = ctx.resources.getIdentifier("errors_$code", "string", ctx.packageName)
    return stringResource(if (id != 0) id else R.string.errors_UNKNOWN)
}

@Composable
private fun statusLabel(s: Status): String = stringResource(
    when (s) {
        Status.PASSED -> R.string.status_passed
        Status.FAILED -> R.string.status_failed
        Status.NEEDED -> R.string.status_needed
        Status.SECURED -> R.string.status_secured
        Status.IMPOSSIBLE -> R.string.status_impossible
    },
)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ClassesScreen(state: UiState, vm: AppViewModel) {
    val locale = currentLocale()
    val scale = state.scale
    val selected = state.selected
    val newName = stringResource(R.string.classes_new_name)
    var confirmDelete by remember { mutableStateOf(false) }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(stringResource(R.string.app_name)) },
                actions = {
                    SyncIndicator(state, vm)
                    IconButton(onClick = { vm.createClass(newName) }) {
                        Icon(Icons.Default.Add, stringResource(R.string.classes_new))
                    }
                    IconButton(onClick = { vm.show(Screen.Settings) }) {
                        Icon(Icons.Default.Settings, stringResource(R.string.settings_title))
                    }
                },
            )
        },
    ) { padding ->
        val classes = state.classes
        if (classes.isEmpty() || selected == null) {
            Column(
                Modifier.fillMaxSize().padding(padding).padding(24.dp),
                verticalArrangement = Arrangement.spacedBy(16.dp, Alignment.CenterVertically),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                Text(stringResource(R.string.classes_empty))
                Button(onClick = { vm.createClass(newName) }) { Text(stringResource(R.string.classes_new)) }
            }
            return@Scaffold
        }
        val result = remember(selected, scale) { calculate(selected, scale) }
        LazyColumn(
            Modifier.fillMaxSize().padding(padding).imePadding(),
            contentPadding = PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            item { ClassSelector(classes, selected, scale, vm) }
            item { ResultsCard(selected, result, scale) }
            item {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    OutlinedTextField(
                        selected.name,
                        { name -> vm.edit { it.copy(name = name.take(100)) } },
                        Modifier.weight(1f),
                        label = { Text(stringResource(R.string.classes_name)) },
                        singleLine = true,
                        textStyle = MaterialTheme.typography.titleMedium,
                    )
                    IconButton(onClick = { confirmDelete = true }) {
                        Icon(Icons.Default.Delete, stringResource(R.string.classes_delete))
                    }
                }
            }
            item { Text(stringResource(R.string.editor_evaluations), style = MaterialTheme.typography.titleMedium) }
            item { EvaluationRows(selected.items, result, scale, depth = 1, vm = vm) }
            item {
                val evalName = stringResource(R.string.editor_default_name)
                val topSum = selected.items.sumOf { it.weight } + selected.examWeight
                OutlinedButton(
                    onClick = { vm.editItems { it + newEvaluation(evalName.format(it.countNodes() + 1), 100 - topSum) } },
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Icon(Icons.Default.Add, null)
                    Spacer(Modifier.width(6.dp))
                    Text(stringResource(R.string.editor_add_evaluation))
                }
            }
            item { ExamCard(selected, result, scale, vm) }
            item {
                val topSum = selected.items.sumOf { it.weight } + selected.examWeight
                WeightSum(topSum, locale)
            }
        }
    }

    if (confirmDelete && selected != null) {
        AlertDialog(
            onDismissRequest = { confirmDelete = false },
            text = { Text(stringResource(R.string.classes_confirm_delete, selected.name)) },
            confirmButton = {
                TextButton(onClick = { confirmDelete = false; vm.deleteSelected() }) {
                    Text(stringResource(R.string.classes_delete), color = MaterialTheme.colorScheme.error)
                }
            },
            dismissButton = { TextButton(onClick = { confirmDelete = false }) { Text(stringResource(R.string.cancel)) } },
        )
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun ClassSelector(classes: List<StoredClass>, selected: StoredClass, scale: Scale, vm: AppViewModel) {
    val locale = currentLocale()
    var expanded by remember { mutableStateOf(false) }
    @Composable
    fun label(c: StoredClass): String {
        val r = calculate(c, scale)
        return "${c.name} · ${statusLabel(r.status)} · ${formatGrade(r.finalGrade, locale)}"
    }
    ExposedDropdownMenuBox(expanded = expanded, onExpandedChange = { expanded = it }) {
        OutlinedTextField(
            value = label(selected),
            onValueChange = {},
            readOnly = true,
            label = { Text(stringResource(R.string.classes_select)) },
            trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded) },
            modifier = Modifier.fillMaxWidth().menuAnchor(ExposedDropdownMenuAnchorType.PrimaryNotEditable),
            singleLine = true,
        )
        ExposedDropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
            classes.forEach { c ->
                DropdownMenuItem(text = { Text(label(c)) }, onClick = { vm.select(c.id); expanded = false })
            }
        }
    }
}

@Composable
private fun statusColor(s: Status): Color = when (s) {
    Status.PASSED, Status.SECURED -> MaterialTheme.colorScheme.secondary
    Status.NEEDED -> MaterialTheme.colorScheme.primary
    Status.FAILED, Status.IMPOSSIBLE -> MaterialTheme.colorScheme.error
}

@Composable
private fun ResultsCard(cls: StoredClass, result: CalcResult, scale: Scale) {
    val locale = currentLocale()
    val examFailed = cls.examGrade != null && cls.minExamGrade != null && cls.examGrade < cls.minExamGrade
    Card(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text(stringResource(R.string.results_title), style = MaterialTheme.typography.titleMedium)
            Text(statusLabel(result.status), color = statusColor(result.status), fontWeight = FontWeight.Bold, style = MaterialTheme.typography.titleLarge)
            Text(
                if (examFailed) stringResource(R.string.results_exam_failed, formatNumber(cls.minExamGrade, locale))
                else when (result.status) {
                    Status.PASSED -> stringResource(R.string.explain_passed)
                    Status.FAILED -> stringResource(R.string.explain_failed)
                    Status.NEEDED -> stringResource(R.string.explain_needed)
                    Status.SECURED -> stringResource(R.string.explain_secured)
                    Status.IMPOSSIBLE -> stringResource(R.string.explain_impossible, formatNumber(scale.max, locale))
                },
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            FlowRow(horizontalArrangement = Arrangement.spacedBy(24.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                result.neededGrade?.let { Stat(R.string.results_needed_grade, formatNeeded(it, locale)) }
                result.examNeeded?.let { Stat(R.string.results_exam_needed, formatNeeded(it, locale)) }
                Stat(R.string.results_final_grade, formatGrade(result.finalGrade, locale))
            }
            if (result.warnings.isNotEmpty()) {
                val min = formatNumber(scale.min, locale)
                val max = formatNumber(scale.max, locale)
                val examName = stringResource(R.string.editor_exam)
                result.warnings.forEach { w ->
                    val name = w.id?.let { cls.items.findNode(it)?.name } ?: examName
                    Text(
                        when (w.code) {
                            WarningCode.WEIGHT_SUM ->
                                if (w.id == null) stringResource(R.string.warning_weight_sum_top)
                                else stringResource(R.string.warning_weight_sum_group, name)
                            WarningCode.GRADE_OUT_OF_RANGE -> stringResource(R.string.warning_grade_out_of_range, name, min, max)
                            WarningCode.MIN_EXAM_OUT_OF_RANGE -> stringResource(R.string.warning_min_exam_out_of_range, min, max)
                        },
                        color = MaterialTheme.colorScheme.tertiary,
                        style = MaterialTheme.typography.bodySmall,
                    )
                }
            }
        }
    }
}

@Composable
private fun Stat(@StringRes label: Int, value: String) {
    Column {
        Text(stringResource(label), style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Text(value, style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.ExtraBold)
    }
}

/** Number text field accepting "5,5" or "5.5"; keeps partial input while typing. */
@Composable
fun NumberField(
    value: Double?,
    onChange: (Double?) -> Unit,
    label: String,
    modifier: Modifier = Modifier,
    placeholder: String? = null,
    range: ClosedFloatingPointRange<Double>? = null,
    /** Grade field: insert the decimal separator automatically based on the range max (e.g. "54" → "5.4"). */
    grade: Boolean = false,
) {
    val locale = currentLocale()
    fun show(v: Double?) = v?.let { formatNumber(it, locale, 4) } ?: ""
    var field by remember { mutableStateOf(TextFieldValue(show(value))) }
    LaunchedEffect(value, locale) {
        if (parseNumber(field.text) != value) show(value).let { field = TextFieldValue(it, TextRange(it.length)) }
    }
    val parsed = parseNumber(field.text)
    val invalid = parsed === Invalid || (parsed is Double && range != null && parsed !in range)
    OutlinedTextField(
        value = field,
        onValueChange = {
            field = if (grade && range != null && it.text != field.text) {
                val text = autoDecimal(it.text, range.endInclusive).replace('.', decimalSeparator(locale))
                if (text == it.text) it else TextFieldValue(text, TextRange(text.length))
            } else {
                it
            }
            when (val p = parseNumber(field.text)) {
                null -> onChange(null)
                is Double -> onChange(p)
            }
        },
        modifier = modifier,
        label = { Text(label, maxLines = 1) },
        placeholder = placeholder?.let { { Text(it, color = MaterialTheme.colorScheme.primary, maxLines = 1) } },
        isError = invalid,
        singleLine = true,
        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
    )
}

@Composable
private fun WeightSum(sum: Double, locale: java.util.Locale) {
    val ok = abs(sum - 100) < 1e-9
    Text(
        if (ok) stringResource(R.string.editor_weight_sum_ok) else stringResource(R.string.editor_weight_sum, formatNumber(sum, locale)),
        style = MaterialTheme.typography.labelSmall,
        color = if (ok) MaterialTheme.colorScheme.onSurfaceVariant else MaterialTheme.colorScheme.tertiary,
        fontWeight = if (ok) FontWeight.Normal else FontWeight.SemiBold,
    )
}

@Composable
private fun EvaluationRows(items: List<Evaluation>, result: CalcResult, scale: Scale, depth: Int, vm: AppViewModel) {
    val locale = currentLocale()
    val evalName = stringResource(R.string.editor_default_name)
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        items.forEach { e ->
            val node = result.nodes[e.id]
            Card(
                colors = CardDefaults.cardColors(
                    containerColor = if (depth == 1) MaterialTheme.colorScheme.surfaceContainerLow else MaterialTheme.colorScheme.surfaceContainer,
                ),
            ) {
                Column(Modifier.padding(10.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        OutlinedTextField(
                            e.name,
                            { name -> vm.editItems { it.mapNode(e.id) { n -> n.copy(name = name.take(100)) } } },
                            Modifier.weight(1f),
                            label = { Text(stringResource(R.string.editor_name)) },
                            singleLine = true,
                        )
                        if (depth < 5) {
                            IconButton(onClick = { vm.editItems { it.addChild(e.id) { n -> evalName.format(n) } } }) {
                                Icon(Icons.Default.Add, stringResource(R.string.editor_add_sub))
                            }
                        }
                        IconButton(onClick = { vm.editItems { it.removeNode(e.id) } }) {
                            Icon(Icons.Default.Close, stringResource(R.string.editor_remove))
                        }
                    }
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                        NumberField(
                            e.weight,
                            { w -> vm.editItems { it.mapNode(e.id) { n -> n.copy(weight = w ?: 0.0) } } },
                            stringResource(R.string.editor_weight),
                            Modifier.weight(1f),
                            range = 0.0..100.0,
                        )
                        if (e.isGroup) {
                            Column(Modifier.weight(1f)) {
                                Text(stringResource(R.string.editor_group_grade), style = MaterialTheme.typography.labelSmall)
                                Text(
                                    node?.let { formatGrade(it.grade, locale) } ?: "–",
                                    style = MaterialTheme.typography.titleLarge,
                                    fontWeight = FontWeight.Bold,
                                    fontStyle = if (node?.pending == true) FontStyle.Italic else FontStyle.Normal,
                                    color = if (node?.pending == true) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurface,
                                )
                            }
                        } else {
                            val needed = if (e.grade == null) result.neededGrade else null
                            NumberField(
                                e.grade,
                                { g -> vm.editItems { it.mapNode(e.id) { n -> n.copy(grade = g) } } },
                                stringResource(R.string.editor_grade),
                                Modifier.weight(1f),
                                placeholder = needed?.let { stringResource(R.string.results_need, formatNeeded(it, locale)) }
                                    ?: stringResource(R.string.editor_pending),
                                range = scale.min..scale.max,
                                grade = true,
                            )
                        }
                    }
                    if (e.isGroup) {
                        Column(Modifier.padding(start = 8.dp)) {
                            EvaluationRows(e.children!!, result, scale, depth + 1, vm)
                            Spacer(Modifier.height(4.dp))
                            WeightSum(e.children.sumOf { it.weight }, locale)
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun ExamCard(cls: StoredClass, result: CalcResult, scale: Scale, vm: AppViewModel) {
    val locale = currentLocale()
    Card(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text(stringResource(R.string.editor_exam), style = MaterialTheme.typography.titleMedium)
            NumberField(cls.examWeight, { v -> vm.edit { it.copy(examWeight = v ?: 0.0) } }, stringResource(R.string.editor_exam_weight), Modifier.fillMaxWidth(), range = 0.0..100.0)
            NumberField(
                cls.minExamGrade, { v -> vm.edit { it.copy(minExamGrade = v) } }, stringResource(R.string.editor_min_exam_grade),
                Modifier.fillMaxWidth(), placeholder = stringResource(R.string.editor_none), range = scale.min..scale.max, grade = true,
            )
            NumberField(
                cls.examGrade, { v -> vm.edit { it.copy(examGrade = v) } }, stringResource(R.string.editor_exam_grade),
                Modifier.fillMaxWidth(),
                placeholder = result.examNeeded?.let { stringResource(R.string.results_need, formatNeeded(it, locale)) }
                    ?: stringResource(R.string.editor_pending),
                range = scale.min..scale.max,
                grade = true,
            )
        }
    }
}

private val PRESETS = listOf(Scale(1.0, 7.0, 4.0), Scale(0.0, 10.0, 5.0), Scale(0.0, 20.0, 10.0), Scale(0.0, 100.0, 60.0))


@Composable
private fun SyncIndicator(state: UiState, vm: AppViewModel) {
    if (state.data.account == null) return
    when (val s = state.sync) {
        SyncState.Syncing -> CircularProgressIndicator(Modifier.padding(12.dp).size(20.dp), strokeWidth = 2.dp)
        is SyncState.Error -> IconButton(onClick = { vm.show(Screen.Settings) }) {
            Icon(Icons.Default.Warning, stringResource(R.string.sync_failed), tint = MaterialTheme.colorScheme.error)
        }
        SyncState.Idle -> Unit
    }
}

@Composable
private fun messageText(m: Message): String = when (m.code) {
    "SETTINGS_SAVED" -> stringResource(R.string.settings_saved)
    "EXPORT_DONE" -> stringResource(R.string.data_export_done)
    "IMPORT_DONE" -> pluralStringResource(R.plurals.data_import_done, m.arg, m.arg)
    "IMPORT_FAILED" -> stringResource(R.string.data_import_failed)
    else -> errorText(m.code)
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SettingsScreen(state: UiState, vm: AppViewModel) {
    val locale = currentLocale()
    val context = LocalContext.current
    val data = state.data
    var min by remember { mutableStateOf<Double?>(data.scale.min) }
    var max by remember { mutableStateOf<Double?>(data.scale.max) }
    var pass by remember { mutableStateOf<Double?>(data.scale.pass) }
    var language by remember { mutableStateOf(vm.currentLocaleTag()) }
    var server by rememberSaveable { mutableStateOf(data.account?.serverUrl ?: "") }
    var email by rememberSaveable { mutableStateOf("") }
    var password by rememberSaveable { mutableStateOf("") }

    // Keep the form in sync when an import or a sync changes the scale.
    LaunchedEffect(data.scale) {
        min = data.scale.min; max = data.scale.max; pass = data.scale.pass
    }

    val exportLauncher = rememberLauncherForActivityResult(ActivityResultContracts.CreateDocument("application/json")) { uri ->
        uri?.let { vm.exportTo(context.contentResolver, it) }
    }
    val importLauncher = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        uri?.let { vm.importFrom(context.contentResolver, it) }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(stringResource(R.string.settings_title)) },
                navigationIcon = {
                    IconButton(onClick = { vm.show(Screen.Classes) }) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, stringResource(R.string.settings_back))
                    }
                },
            )
        },
    ) { padding ->
        Column(
            Modifier.fillMaxSize().padding(padding).verticalScroll(rememberScrollState()).imePadding().padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            state.message?.let { m ->
                Text(messageText(m), color = if (m.isError) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.secondary)
            }

            // Grading scale
            Text(stringResource(R.string.settings_scale), style = MaterialTheme.typography.titleMedium)
            Text(stringResource(R.string.settings_scale_help), style = MaterialTheme.typography.bodySmall)
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                NumberField(min, { min = it }, stringResource(R.string.settings_min), Modifier.weight(1f))
                NumberField(max, { max = it }, stringResource(R.string.settings_max), Modifier.weight(1f))
                NumberField(pass, { pass = it }, stringResource(R.string.settings_pass), Modifier.weight(1f))
            }
            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                PRESETS.forEach { p ->
                    AssistChip(
                        onClick = { min = p.min; max = p.max; pass = p.pass },
                        label = { Text("${formatNumber(p.min, locale)}–${formatNumber(p.max, locale)} (${formatNumber(p.pass, locale)})") },
                    )
                }
            }
            Button(onClick = { vm.saveScale(Scale(min ?: Double.NaN, max ?: Double.NaN, pass ?: Double.NaN)) }) {
                Text(stringResource(R.string.settings_save))
            }

            // Language (per device)
            HorizontalDivider()
            Text(stringResource(R.string.settings_language), style = MaterialTheme.typography.titleMedium)
            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                listOf(null to stringResource(R.string.settings_system), "en" to "English", "es" to "Español").forEach { (code, name) ->
                    FilterChip(selected = language == code, onClick = { language = code; vm.applyLocale(code) }, label = { Text(name) })
                }
            }

            // Optional sync
            HorizontalDivider()
            Text(stringResource(R.string.sync_title), style = MaterialTheme.typography.titleMedium)
            Text(stringResource(R.string.sync_help), style = MaterialTheme.typography.bodySmall)
            val account = data.account
            if (account != null) {
                Text(stringResource(R.string.sync_signed_in_as, account.email, account.serverUrl))
                val last = account.lastSyncAt?.let {
                    DateFormat.getDateTimeInstance(DateFormat.MEDIUM, DateFormat.SHORT, locale).format(Date(it))
                } ?: stringResource(R.string.sync_never)
                Text(
                    if (state.sync == SyncState.Syncing) stringResource(R.string.sync_syncing) else stringResource(R.string.sync_last_synced, last),
                    style = MaterialTheme.typography.bodySmall,
                )
                (state.sync as? SyncState.Error)?.let { Text(errorText(it.code), color = MaterialTheme.colorScheme.error) }
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Button(onClick = { vm.syncNow() }, enabled = state.sync != SyncState.Syncing) { Text(stringResource(R.string.sync_now)) }
                    OutlinedButton(onClick = { vm.signOut() }) { Text(stringResource(R.string.sync_sign_out)) }
                }
            } else {
                (state.sync as? SyncState.Error)?.let { Text(errorText(it.code), color = MaterialTheme.colorScheme.error) }
                OutlinedTextField(
                    server, { server = it }, Modifier.fillMaxWidth(),
                    label = { Text(stringResource(R.string.sync_server)) }, singleLine = true,
                    placeholder = { Text("http://192.168.1.10:3000") },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri),
                )
                OutlinedTextField(
                    email, { email = it }, Modifier.fillMaxWidth(),
                    label = { Text(stringResource(R.string.auth_email)) }, singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email),
                )
                OutlinedTextField(
                    password, { password = it }, Modifier.fillMaxWidth(),
                    label = { Text(stringResource(R.string.auth_password)) }, singleLine = true,
                    visualTransformation = PasswordVisualTransformation(),
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
                    supportingText = { Text(stringResource(R.string.auth_password_hint)) },
                )
                val ready = !state.busy && server.isNotBlank() && email.isNotBlank() && password.length >= 8
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Button(onClick = { vm.signIn(server, email, password, register = false) }, enabled = ready) {
                        Text(stringResource(R.string.auth_login))
                    }
                    OutlinedButton(onClick = { vm.signIn(server, email, password, register = true) }, enabled = ready) {
                        Text(stringResource(R.string.auth_register))
                    }
                }
            }

            // Backup
            HorizontalDivider()
            Text(stringResource(R.string.data_title), style = MaterialTheme.typography.titleMedium)
            Text(stringResource(R.string.data_help), style = MaterialTheme.typography.bodySmall)
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedButton(onClick = { exportLauncher.launch("grades-${LocalDate.now()}.json") }) { Text(stringResource(R.string.data_export)) }
                OutlinedButton(onClick = { importLauncher.launch(arrayOf("application/json", "text/plain", "application/octet-stream")) }) {
                    Text(stringResource(R.string.data_import))
                }
            }
        }
    }
}
