plugins {
  id("com.adarshr.test-logger")
  id("com.github.gmazzo.buildconfig")
  id("base")
}

version = (properties["VERSION"] as? String) ?: "0.0.1"
group = GenstackBuild.mavenGroup

testlogger {
    theme = com.adarshr.gradle.testlogger.theme.ThemeType.MOCHA_PARALLEL
}
