@file:OptIn(org.jetbrains.kotlin.gradle.ExperimentalWasmDsl::class)

import GenstackBuild as Constants

plugins {
  `maven-publish`
  alias(libs.plugins.nexus)
  alias(libs.plugins.buf)
  alias(libs.plugins.android.library)
  alias(libs.plugins.idea.ext)
  alias(libs.plugins.genstack.kmp)
  alias(libs.plugins.genstack.root)
}

java {
  sourceCompatibility = GenstackBuild.javaVersion
  targetCompatibility = GenstackBuild.javaVersion

  toolchain {
    vendor = GenstackBuild.androidToolchainVendor
    languageVersion = GenstackBuild.androidToolchainVersion
  }
}

buf {
    configFileLocation = file("buf.yaml")

    generate {
        includeImports = false
        templateFileLocation = file("buf.gen.yaml")
    }
}

kotlin {
  explicitApiWarning()
  androidTarget()

  jvm { configureJvmTarget() }
  js { configureJsTarget() }

  if (GenstackBuild.wasm) wasmJs {
    configureJsTarget()
  }
  if (GenstackBuild.wasi) wasmWasi {
    nodejs()
  }
  if (GenstackBuild.enableiOS) {
    iosArm64()
    iosSimulatorArm64()
  }
  if (GenstackBuild.enableArm64) {
    macosArm64()
    linuxArm64()
  }
  if (GenstackBuild.enableX64) {
    macosX64()
    linuxX64()
    mingwX64()
  }

  sourceSets {
    commonMain.dependencies {
      // api(kotlinx.bundles.all)
    }
    commonTest.dependencies {
      implementation(kotlin("test"))
    }
    androidMain.dependencies {
      api(protocol.bundles.android)
      api(libs.bundles.protobuf.lite)
      api(libs.bundles.grpc.lite)
    }
    jvmMain {
      kotlin {
        listOf(
          "proto/java",
          "proto/kotlin",
          "grpc/java",
          "grpc/kotlin",
        ).forEach {
          srcDir(layout.buildDirectory.dir("bufbuild/generated/build/gen/$it"))
        }
      }

      dependencies {
        api(genstack.config)
        api(libs.bundles.protobuf.jvm)
        api(libs.bundles.grpc.jvm)
      }
    }
  }
}

android {
  compileSdk = GenstackBuild.androidCompileTarget
  namespace = androidNamespace("protocol")
  sourceSets["main"].manifest.srcFile("src/androidMain/AndroidManifest.xml")

  defaultConfig {
    minSdk = GenstackBuild.androidMinSdk
  }
  compileOptions {
    sourceCompatibility = GenstackBuild.javaVersion
    targetCompatibility = GenstackBuild.javaVersion
  }
}

configureKmpProject()
publishableKmpLib()

listOf(
  tasks.named("compileKotlinJvm"),
  tasks.named("compileKotlinJs"),
).forEach {
  it.configure {
    dependsOn("bufGenerate")
  }
}

tasks.bufLint.configure { enabled = false }
tasks.bufFormatCheck.configure { enabled = false }
