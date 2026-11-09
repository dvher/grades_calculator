import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif

private struct Credentials: Codable {
    let email: String
    let password: String
}

private struct ErrorBody: Decodable {
    struct Inner: Decodable { let code: String }
    let error: Inner
}

public struct AuthUser: Codable, Sendable {
    public let id: String
    public let email: String
}

public struct AuthResponse: Codable, Sendable {
    public let token: String
    public let user: AuthUser
}

public struct SyncBody: Codable, Sendable {
    public var classes: [StoredClass]
    public var settings: SyncedSettings

    public init(classes: [StoredClass], settings: SyncedSettings) {
        self.classes = classes
        self.settings = settings
    }
}

public struct SyncResponse: Codable, Sendable {
    public var classes: [StoredClass]
    public var settings: SyncedSettings
}

/// Client for the optional sync server.
public struct APIClient: Sendable {
    public init() {}

    private func post<T: Decodable>(_ serverURL: String, _ path: String, body: some Encodable, token: String? = nil) async throws -> T {
        let trimmed = serverURL.trimmingCharacters(in: .whitespaces).trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        guard let url = URL(string: trimmed + "/api" + path), url.scheme != nil else {
            throw APIError(code: "NETWORK", status: 0)
        }
        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.timeoutInterval = 20
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        if let token { req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization") }
        req.httpBody = try JSONEncoder().encode(body)
        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await URLSession.shared.data(for: req)
        } catch {
            throw APIError(code: "NETWORK", status: 0)
        }
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        guard (200..<300).contains(status) else {
            let code = (try? JSONDecoder().decode(ErrorBody.self, from: data))?.error.code ?? "UNKNOWN"
            throw APIError(code: code, status: status)
        }
        do {
            return try JSONDecoder().decode(T.self, from: data)
        } catch {
            throw APIError(code: "UNKNOWN", status: status)
        }
    }

    public func login(serverURL: String, email: String, password: String) async throws -> AuthResponse {
        try await post(serverURL, "/auth/login", body: Credentials(email: email, password: password))
    }

    public func register(serverURL: String, email: String, password: String) async throws -> AuthResponse {
        try await post(serverURL, "/auth/register", body: Credentials(email: email, password: password))
    }

    public func sync(serverURL: String, token: String, _ body: SyncBody) async throws -> SyncResponse {
        try await post(serverURL, "/sync", body: body, token: token)
    }
}

// MARK: - Number parsing / formatting

public enum ParsedNumber: Equatable {
    case empty
    case invalid
    case value(Double)
}

/// Accepts "5.5" and "5,5".
public func parseNumber(_ text: String) -> ParsedNumber {
    let t = text.trimmingCharacters(in: .whitespaces).replacingOccurrences(of: ",", with: ".")
    if t.isEmpty { return .empty }
    guard t != ".", t != "-", t.range(of: #"^-?\d*\.?\d*$"#, options: .regularExpression) != nil, let v = Double(t) else {
        return .invalid
    }
    return .value(v)
}

/// Formats grade input as it is typed so the decimal point is optional: "54" becomes "5.4" on a 1–7 scale.
/// Without a separator, the integer part is the longest digit prefix not exceeding `max`; an explicit "." or ","
/// is honored once and repeated separators are dropped. Always returns "." as the separator.
public func autoDecimal(_ text: String, max: Double) -> String {
    let t = String(text.replacingOccurrences(of: ",", with: ".").filter { $0.isASCII && ($0.isNumber || $0 == ".") })
    if let dot = t.firstIndex(of: ".") {
        let int = t[..<dot].isEmpty ? "0" : String(t[..<dot])
        return int + "." + t[t.index(after: dot)...].replacingOccurrences(of: ".", with: "")
    }
    if t.isEmpty { return "" }
    let digits = Array(t)
    var intLen = 1
    if digits[0] != "0" {
        while intLen < digits.count, let v = Double(String(digits[0...intLen])), v <= max { intLen += 1 }
    }
    return intLen < digits.count ? String(digits[..<intLen]) + "." + String(digits[intLen...]) : t
}
