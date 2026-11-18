plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "sy.buscredits.proto"
    compileSdk = 35

    defaultConfig {
        applicationId = "sy.buscredits.proto"
        minSdk = 26          // Android 8 : pour tester sur un maximum de telephones
        targetSdk = 35
        versionCode = 1
        versionName = "0.1-prototype"
    }

    buildTypes {
        release { isMinifyEnabled = false }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
}

android {
    testOptions { unitTests.isReturnDefaultValues = true }
}

dependencies {
    testImplementation("junit:junit:4.13.2")
    testImplementation("org.json:json:20240303")   // vraie implementation org.json pour les tests JVM
}

// Vecteurs d'interoperabilite generes par le vrai serveur (voir ../tools/interop-vectors.js)
tasks.withType<Test>().configureEach {
    systemProperty("vectors", System.getenv("BC_VECTORS") ?: "")
    systemProperty("records", System.getenv("BC_RECORDS") ?: "")
    testLogging { events("passed", "failed", "skipped"); showStandardStreams = true }
}
