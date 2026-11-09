package com.diego.gradescalculator.data

import android.content.Context
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import java.io.File

/** Persists [AppData] as JSON in the app's private files (included in Android's auto backup). */
class LocalStore(context: Context) {
    private val file = File(context.filesDir, "data.json")
    private val writeLock = Mutex()

    suspend fun load(): AppData = withContext(Dispatchers.IO) {
        if (!file.exists()) AppData()
        else runCatching { json.decodeFromString<AppData>(file.readText()) }.getOrElse { AppData() }
    }

    suspend fun save(data: AppData) = writeLock.withLock {
        withContext(Dispatchers.IO) { write(data) }
    }

    private fun write(data: AppData) {
        // Write to a temp file first so a crash mid-write never corrupts the data.
        val tmp = File(file.parentFile, "data.json.tmp")
        tmp.writeText(json.encodeToString(data))
        tmp.renameTo(file)
    }
}
