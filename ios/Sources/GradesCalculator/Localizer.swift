import Foundation
import GradesCore
import Observation

/// Looks up strings in the chosen language's .lproj, so the language can be switched in-app.
@MainActor @Observable
final class Localizer {
    static let supported = ["en", "es"]

    /// nil follows the system language.
    var language: String? {
        didSet { resolve() }
    }

    private(set) var bundle: Bundle = .module
    private(set) var locale: Locale = .current

    init() { resolve() }

    private func resolve() {
        let lang = language
            ?? Bundle.preferredLocalizations(from: Self.supported, forPreferences: Locale.preferredLanguages).first
            ?? "en"
        bundle = Bundle.module.path(forResource: lang, ofType: "lproj").flatMap(Bundle.init(path:)) ?? .module
        // Keep the region (decimal separator etc.) but use the chosen language.
        let region = Locale.current.region?.identifier ?? (lang == "es" ? "CL" : "US")
        locale = Locale(identifier: "\(lang)_\(region)")
    }

    func t(_ key: String, _ args: CVarArg...) -> String {
        let format = bundle.localizedString(forKey: key, value: nil, table: nil)
        return args.isEmpty ? format : String(format: format, locale: locale, arguments: args)
    }

    // MARK: Number formatting

    func number(_ x: Double, maxDecimals: Int = 2) -> String {
        x.formatted(.number.precision(.fractionLength(0...maxDecimals)).grouping(.never).locale(locale))
    }

    private func oneDecimal(_ x: Double) -> String {
        x.formatted(.number.precision(.fractionLength(1)).grouping(.never).locale(locale))
    }

    func grade(_ x: Double) -> String { oneDecimal(roundGrade(x)) }
    func needed(_ x: Double) -> String { oneDecimal(roundNeeded(x)) }
}

