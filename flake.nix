{
  description = "Grades calculator — server, web, Android and iOS (xtool) dev environment";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
  };

  outputs = { self, nixpkgs }:
    let
      system = "x86_64-linux";
      pkgs = import nixpkgs {
        inherit system;
        config = {
          allowUnfree = true;
          android_sdk.accept_license = true;
        };
      };

      xtool = pkgs.appimageTools.wrapType2 rec {
        pname = "xtool";
        version = "1.23.0";
        src = pkgs.fetchurl {
          url = "https://github.com/xtool-org/xtool/releases/download/${version}/xtool-x86_64.AppImage";
          hash = "sha256-Jw+2Ywuu7eLMfFFr+tot6B+Z4RwAtZJ/WcDLUSm9Vvc=";
        };
      };

      android = pkgs.androidenv.composeAndroidPackages {
        platformVersions = [ "37" ];
        buildToolsVersions = [ "37.0.0" ];
        includeEmulator = false;
        includeSystemImages = false;
        includeNDK = false;
      };
      androidSdk = android.androidsdk;
    in
    {
      packages.${system}.xtool = xtool;

      devShells.${system}.default = pkgs.mkShell {
        packages = [
          pkgs.nodejs_24
          pkgs.postgresql_16
          pkgs.docker-compose
          pkgs.python3
          pkgs.jdk17
          pkgs.gradle
          androidSdk
          pkgs.swift
          pkgs.swiftpm
          xtool
        ];

        ANDROID_HOME = "${androidSdk}/libexec/android-sdk";
        ANDROID_SDK_ROOT = "${androidSdk}/libexec/android-sdk";
        JAVA_HOME = "${pkgs.jdk17.home}";
        GRADLE_OPTS = "-Dorg.gradle.project.android.aapt2FromMavenOverride=${androidSdk}/libexec/android-sdk/build-tools/37.0.0/aapt2";

        shellHook = ''
          echo "grades-calculator dev shell: node $(node --version)"
        '';
      };
    };
}
