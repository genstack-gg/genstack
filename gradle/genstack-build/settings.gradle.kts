@file:Suppress("UnstableApiUsage", "DSL_SCOPE_VIOLATION")

pluginManagement {
  repositories {
    gradlePluginPortal()
    mavenCentral()
    google()
  }
}

plugins {
  val agpVersion: String by settings
  val micronautPluginsVersion: String by settings

  id("com.android.settings") version (agpVersion)
  id("io.micronaut.platform.catalog") version (micronautPluginsVersion)
  id("org.gradle.toolchains.foojay-resolver-convention") version ("0.9.0")
  id("com.gradle.enterprise") version("3.16.2")
  id("com.gradle.common-custom-user-data-gradle-plugin") version "2.0.2"
}

dependencyResolutionManagement {
  repositories {
    maven {
      name = "buf"
      url = uri("https://buf.build/gen/maven")
      content {
        includeGroup("build.buf.gen")
      }
    }
    gradlePluginPortal()
    mavenCentral()
    google()
  }

  versionCatalogs {
    create("libs") {
      from(files("../libs.versions.toml"))
    }
    create("kotlinx") {
      from(files("../kotlinx.versions.toml"))
    }
    create("npm") {
      from(files("../npm.versions.toml"))
    }
    create("protocol") {
      from(files("../protocol.versions.toml"))
    }
    create("gvm") {
      from(files("../graalvm.versions.toml"))
    }
    create("kjs") {
      val kotlinxWrappersVersion: String by settings
      from("org.jetbrains.kotlin-wrappers:kotlin-wrappers-catalog:$kotlinxWrappersVersion")
    }
    create("elide") {
      val elideVersion: String by settings
      from("dev.elide:elide-bom:$elideVersion")
    }
    create("androidx") {
      val androidxVersion: String by settings
      from("androidx.gradle:gradle-version-catalog:$androidxVersion")
    }
  }
}

rootProject.name = "genstack-build"

gradleEnterprise {
    buildScan {
        termsOfServiceUrl = "https://gradle.com/help/legal-terms-of-use"
        termsOfServiceAgree = "yes"
    }
}
