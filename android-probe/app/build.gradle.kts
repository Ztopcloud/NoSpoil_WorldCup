plugins {
    id("com.android.application")
}

android {
    namespace = "tv.scgs.probe"
    compileSdk = 35

    defaultConfig {
        applicationId = "tv.scgs.probe"
        minSdk = 23
        targetSdk = 35
        versionCode = 1
        versionName = "0.1.0-probe"
    }

    sourceSets {
        getByName("main") {
            assets.srcDir(layout.buildDirectory.dir("generated/nospoil-assets"))
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
