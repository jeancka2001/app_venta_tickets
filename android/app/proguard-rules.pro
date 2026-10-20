# Add project specific ProGuard rules here.
# You can control the set of applied configuration files using the
# proguardFiles setting in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# If your project uses WebView with JS, uncomment the following
# and specify the fully qualified class name to the JavaScript interface
# class:
#-keepclassmembers class fqcn.of.javascript.interface.for.webview {
#   public *;
#}

# Conserva números de línea para que los stack traces de Play Console sean legibles
-keepattributes SourceFile,LineNumberTable,*Annotation*,Signature,InnerClasses,EnclosingMethod
-renamesourcefileattribute SourceFile

# Capacitor: el bridge usa reflexión y @JavascriptInterface
-keep class com.getcapacitor.** { *; }
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

# Plugins Capacitor usados por la app
-keep class io.capawesome.capacitorjs.plugins.mlkit.barcodescanning.** { *; }
-keep class ee.forgr.biometric.** { *; }
-keep class com.capacitorjs.plugins.** { *; }

# Actividad principal
-keep class ec.ticketsEC.ventas.** { *; }
