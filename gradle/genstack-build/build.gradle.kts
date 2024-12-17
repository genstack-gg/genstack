import org.jetbrains.kotlin.gradle.dsl.JvmTarget
import org.jetbrains.kotlin.gradle.dsl.KotlinVersion

plugins {
  `kotlin-dsl`
}

dependencyLocking {
    lockAllConfigurations()
}

dependencies {
  implementation(libs.bundles.pkl) {
    exclude(group = "org.jetbrains.kotlin", module = "kotlin-stdlib")
    exclude(group = "org.jetbrains.kotlin", module = "kotlin-stdlib-common")
  }

  implementation(kotlinx.build.plugins.abicheck)
  implementation(kotlinx.build.plugins.kover)
  implementation(kotlinx.serialization.core)
  implementation(kotlinx.serialization.json)
  implementation(kotlinx.serialization.protobuf)
  implementation(libs.build.plugins.android.multiplatform.library)
  implementation(libs.build.plugins.buf)
  implementation(libs.build.plugins.buildconfig)
  implementation(libs.build.plugins.buildhealth)
  implementation(libs.build.plugins.buildkite.unittesting)
  implementation(libs.build.plugins.dokka)
  implementation(libs.build.plugins.ideaExt)
  implementation(libs.build.plugins.jreleaser)
  implementation(libs.build.plugins.kotlin.allopen)
  implementation(libs.build.plugins.kotlin)
  implementation(libs.build.plugins.micronaut.aot)
  implementation(libs.build.plugins.micronaut.gradle)
  implementation(libs.build.plugins.nexus)
  implementation(libs.build.plugins.testlogging)
  implementation(libs.build.plugins.versionCheck)

  // enables access to version catalogs in precompiled plugins
  // see: https://github.com/gradle/gradle/issues/15383
  implementation(files(androidx.javaClass.superclass.protectionDomain.codeSource.location))
  implementation(files(elide.javaClass.superclass.protectionDomain.codeSource.location))
  implementation(files(gvm.javaClass.superclass.protectionDomain.codeSource.location))
  implementation(files(kjs.javaClass.superclass.protectionDomain.codeSource.location))
  implementation(files(kotlinx.javaClass.superclass.protectionDomain.codeSource.location))
  implementation(files(libs.javaClass.superclass.protectionDomain.codeSource.location))
  implementation(files(mn.javaClass.superclass.protectionDomain.codeSource.location))
  implementation(files(npm.javaClass.superclass.protectionDomain.codeSource.location))
}

val bytecodeTarget = "21"

java {
  sourceCompatibility = JavaVersion.toVersion(bytecodeTarget)
  targetCompatibility = JavaVersion.toVersion(bytecodeTarget)
}

kotlin {
  explicitApiWarning()

  compilerOptions {
    jvmTarget = JvmTarget.JVM_21
    apiVersion = KotlinVersion.KOTLIN_2_0
    languageVersion = KotlinVersion.KOTLIN_2_0
  }
}
