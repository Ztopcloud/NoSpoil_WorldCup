import java.util.Properties

plugins {
    id("com.android.application")
}

val keystorePropertiesFile = rootProject.file("keystore.properties")
val keystoreProperties = Properties()
if (keystorePropertiesFile.exists()) {
    keystorePropertiesFile.inputStream().use { keystoreProperties.load(it) }
}

android {
    namespace = "tv.scgs.probe"
    compileSdk = 35

    defaultConfig {
        applicationId = "tv.scgs.probe"
        minSdk = 23
        targetSdk = 35
        versionCode = 6
        versionName = "0.2.12-probe"
    }

    buildFeatures {
        buildConfig = true
    }

    if (keystorePropertiesFile.exists()) {
        signingConfigs {
            create("release") {
                storeFile = file(keystoreProperties["storeFile"] as String)
                storePassword = keystoreProperties["storePassword"] as String
                keyAlias = keystoreProperties["keyAlias"] as String
                keyPassword = keystoreProperties["keyPassword"] as String
            }
        }
    }

    buildTypes {
        getByName("release") {
            isDebuggable = false
            isMinifyEnabled = false
            if (keystorePropertiesFile.exists()) {
                signingConfig = signingConfigs.getByName("release")
            }
        }
    }

    sourceSets {
        getByName("main") {
            assets.srcDir(layout.buildDirectory.dir("generated/nospoil-assets"))
        }
    }

    applicationVariants.all {
        outputs.all {
            val variantOutput = this as com.android.build.gradle.internal.api.BaseVariantOutputImpl
            val buildTypeName = variantOutput.name.substringAfterLast('-')
            variantOutput.outputFileName = "时差观赛-${defaultConfig.versionName}-${buildTypeName}.apk"
        }
    }
}

val copyNospoilAssets by tasks.registering(Copy::class) {
    into(layout.buildDirectory.dir("generated/nospoil-assets"))
    from(rootProject.file("../extension/content.js")) {
        into("nospoil")
    }
    from(rootProject.file("../extension/style.css")) {
        into("nospoil")
    }
}

tasks.named("preBuild") {
    dependsOn(copyNospoilAssets)
}
