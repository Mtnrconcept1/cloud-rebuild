# Capacitor / WebView JS bridge
-keep class com.getcapacitor.** { *; }
-keep class com.tok.app.** { *; }
-dontwarn com.getcapacitor.**

# Keep WebView JavaScript interface
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

# Firebase
-keep class com.google.firebase.** { *; }
-dontwarn com.google.firebase.**
-keep class com.google.android.gms.** { *; }
-dontwarn com.google.android.gms.**

# AndroidX
-keep class androidx.** { *; }
-dontwarn androidx.**

# Keep line numbers for crash reports
-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile

# Don't warn about missing optional dependencies
-dontwarn org.apache.http.**
-dontwarn android.net.http.**
