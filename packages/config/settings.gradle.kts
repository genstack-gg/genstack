@file:Suppress("UnstableApiUsage", "DSL_SCOPE_VIOLATION", "UNCHECKED_CAST")

pluginManagement {
  includeBuild("../../gradle/newco-build")
}

plugins {
  id("com.gradle.enterprise") version("3.16.2")
  id("com.gradle.common-custom-user-data-gradle-plugin") version "2.0.2"
}

apply(from = "../../gradle/common-settings.gradle.kts")

typealias GenstackConfig = (settings: Settings, path: String, block: Settings.() -> Unit) -> Unit
(extra["genstack"] as GenstackConfig)(settings, "../") {
  rootProject.name = "sdk"
}

gradleEnterprise {
    buildScan {
        termsOfServiceUrl = "https://gradle.com/help/legal-terms-of-use"
        termsOfServiceAgree = "yes"
    }
}

rootProject.name = "genstack-config"
