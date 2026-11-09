// swift-tools-version: 6.0

import PackageDescription

// Platform-independent grade calculation, models and API client.
// Builds and tests on Linux (`swift test`), used by the iOS app.
let package = Package(
    name: "GradesCore",
    platforms: [.iOS(.v17), .macOS(.v14)],
    products: [
        .library(name: "GradesCore", targets: ["GradesCore"]),
    ],
    targets: [
        .target(name: "GradesCore"),
        .testTarget(name: "GradesCoreTests", dependencies: ["GradesCore"]),
    ]
)
