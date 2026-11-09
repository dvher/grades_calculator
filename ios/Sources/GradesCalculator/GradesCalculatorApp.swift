import SwiftUI

@main
struct GradesCalculatorApp: App {
    @State private var model = AppModel()
    @State private var localizer = Localizer()
    @AppStorage("language") private var language = ""
    @Environment(\.scenePhase) private var scenePhase

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(model)
                .environment(localizer)
                .environment(\.locale, localizer.locale)
                .onChange(of: language, initial: true) { _, lang in
                    localizer.language = lang.isEmpty ? nil : lang
                }
                .onChange(of: scenePhase) { _, phase in
                    if phase == .active { model.syncNow() }
                }
        }
    }
}

struct RootView: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        Group {
            if model.loading {
                ProgressView()
            } else {
                ClassesView()
            }
        }
        .task { await model.start() }
    }
}
