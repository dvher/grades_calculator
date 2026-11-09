// swift-tools-version: 6.0

import PackageDescription

let package = Package(
    name: "GradesCalculator",
    defaultLocalization: "en",
    platforms: [
        .iOS(.v17),
        .macOS(.v14),
    ],
    products: [
        // An xtool project should contain exactly one library product,
        // representing the main app.
        .library(name: "GradesCalculator", targets: ["GradesCalculator"]),
    ],
    dependencies: [
        .package(path: "GradesCore"),
    ],
    targets: [
        .target(
            name: "GradesCalculator",
            dependencies: [.product(name: "GradesCore", package: "GradesCore")],
            resources: [.process("Resources")]
        ),
    ]
)
