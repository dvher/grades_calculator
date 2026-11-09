package com.diego.gradescalculator.data

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.io.IOException
import java.util.concurrent.TimeUnit

val json = Json {
    ignoreUnknownKeys = true
    explicitNulls = true
    encodeDefaults = true
}

/** Client for the optional sync server. */
object Api {
    private val client = OkHttpClient.Builder()
        .connectTimeout(10, TimeUnit.SECONDS)
        .readTimeout(20, TimeUnit.SECONDS)
        .build()
    private val jsonType = "application/json".toMediaType()

    private suspend fun post(serverUrl: String, path: String, body: String, token: String? = null): String =
        withContext(Dispatchers.IO) {
            val builder = try {
                Request.Builder().url(serverUrl.trim().trimEnd('/') + "/api" + path)
            } catch (e: IllegalArgumentException) {
                throw ApiException("NETWORK", 0)
            }
            token?.let { builder.header("Authorization", "Bearer $it") }
            builder.post(body.toRequestBody(jsonType))
            try {
                client.newCall(builder.build()).execute().use { res ->
                    val text = res.body.string()
                    if (!res.isSuccessful) {
                        val code = runCatching {
                            json.parseToJsonElement(text).jsonObject["error"]!!.jsonObject["code"]!!.jsonPrimitive.content
                        }.getOrDefault("UNKNOWN")
                        throw ApiException(code, res.code)
                    }
                    text
                }
            } catch (e: IOException) {
                throw ApiException("NETWORK", 0)
            }
        }

    suspend fun login(serverUrl: String, email: String, password: String): AuthResponse =
        json.decodeFromString(post(serverUrl, "/auth/login", json.encodeToString(Credentials(email, password))))

    suspend fun register(serverUrl: String, email: String, password: String): AuthResponse =
        json.decodeFromString(post(serverUrl, "/auth/register", json.encodeToString(Credentials(email, password))))

    suspend fun sync(serverUrl: String, token: String, body: SyncBody): SyncResponse =
        json.decodeFromString(post(serverUrl, "/sync", json.encodeToString(body), token))
}
