package tv.scgs.probe;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.pm.ActivityInfo;
import android.graphics.Bitmap;
import android.net.Uri;
import android.os.Bundle;
import android.os.Message;
import android.util.Log;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowInsets;
import android.webkit.ConsoleMessage;
import android.webkit.CookieManager;
import android.webkit.JsPromptResult;
import android.webkit.JsResult;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.Locale;

public class MainActivity extends Activity {
    private static final String TAG = "SCGSProbe";
    private static final String HOME_URL = "https://scgs.tv/";
    private static final String APP_DISPLAY_VERSION = "0.2.12-probe";
    private static final int TOOLBAR_HORIZONTAL_PADDING_DP = 16;
    private static final int TOOLBAR_TOP_PADDING_DP = 8;
    private static final int TOOLBAR_BOTTOM_PADDING_DP = 8;
    private static final String[] IN_APP_HOST_SUFFIXES = new String[]{
            "scgs.tv",
            "cctv.com",
            "cntv.cn",
            "yangshipin.cn",
            "xiaohongshu.com"
    };
    private static final String[] NOSPOIL_HOST_SUFFIXES = new String[]{
            "worldcup.cctv.com",
            "sports.cctv.com",
            "cntv.cn",
            "yangshipin.cn"
    };
    private static final String[] XIAOHONGSHU_APP_SCHEMES = new String[]{
            "xhsdiscover",
            "xhslink",
            "xiaohongshu",
            "rednote"
    };

    private FrameLayout root;
    private LinearLayout shell;
    private LinearLayout toolbar;
    private ProgressBar progressBar;
    private TextView statusText;
    private FrameLayout webContainer;
    private WebView webView;
    private TextView nospoilShield;
    private View fullscreenView;
    private WebChromeClient.CustomViewCallback fullscreenCallback;
    private boolean nospoilViewingMode;
    private String nospoilCss;
    private String nospoilJs;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG);

        nospoilCss = readAsset("nospoil/style.css");
        nospoilJs = readAsset("nospoil/content.js");

        root = new FrameLayout(this);
        shell = new LinearLayout(this);
        shell.setOrientation(LinearLayout.VERTICAL);
        root.addView(shell, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
        ));

        toolbar = buildToolbar();
        progressBar = new ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal);
        progressBar.setMax(100);

        webView = new WebView(this);
        configureWebView(webView);
        nospoilShield = buildNospoilShield();

        webContainer = new FrameLayout(this);
        webContainer.addView(webView, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
        ));
        webContainer.addView(nospoilShield, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
        ));

        shell.addView(toolbar);
        shell.addView(progressBar, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                6
        ));
        shell.addView(webContainer, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                0,
                1
        ));

        setContentView(root);
        webView.loadUrl(HOME_URL);
    }

    private LinearLayout buildToolbar() {
        LinearLayout bar = new LinearLayout(this);
        bar.setGravity(Gravity.CENTER_VERTICAL);
        int horizontalPadding = dpToPx(TOOLBAR_HORIZONTAL_PADDING_DP);
        int topPadding = dpToPx(TOOLBAR_TOP_PADDING_DP);
        int bottomPadding = dpToPx(TOOLBAR_BOTTOM_PADDING_DP);
        bar.setPadding(horizontalPadding, topPadding, horizontalPadding, bottomPadding);
        bar.setBackgroundColor(0xff050c2f);
        bar.setOnApplyWindowInsetsListener((view, insets) -> {
            int statusBarInset = 0;
            if (insets != null) {
                statusBarInset = insets.getSystemWindowInsetTop();
            }
            view.setPadding(
                    horizontalPadding,
                    topPadding + statusBarInset,
                    horizontalPadding,
                    bottomPadding
            );
            return insets;
        });

        TextView back = toolbarButton("返回");
        back.setOnClickListener(v -> {
            if (fullscreenView != null) {
                hideFullscreenView();
            } else if (webView.canGoBack()) {
                webView.goBack();
            }
        });

        TextView reload = toolbarButton("刷新");
        reload.setOnClickListener(v -> webView.reload());

        TextView home = toolbarButton("首页");
        home.setOnClickListener(v -> webView.loadUrl(HOME_URL));

        statusText = new TextView(this);
        statusText.setText("时差观赛 Android " + APP_DISPLAY_VERSION);
        statusText.setTextColor(0xffffffff);
        statusText.setSingleLine(true);
        statusText.setTextSize(14);

        bar.addView(back);
        bar.addView(reload);
        bar.addView(home);
        bar.addView(statusText, new LinearLayout.LayoutParams(
                0,
                ViewGroup.LayoutParams.WRAP_CONTENT,
                1
        ));
        bar.requestApplyInsets();
        return bar;
    }

    private TextView buildNospoilShield() {
        TextView shield = new TextView(this);
        shield.setText("净屏加载中...");
        shield.setTextColor(0xffffffff);
        shield.setTextSize(16);
        shield.setGravity(Gravity.CENTER);
        shield.setBackgroundColor(0xff050c2f);
        shield.setVisibility(View.GONE);
        shield.setClickable(true);
        return shield;
    }

    private TextView toolbarButton(String label) {
        TextView button = new TextView(this);
        button.setText(label);
        button.setTextColor(0xffffffff);
        button.setTextSize(14);
        button.setGravity(Gravity.CENTER);
        button.setPadding(18, 10, 18, 10);
        return button;
    }

    @SuppressLint("SetJavaScriptEnabled")
    private void configureWebView(WebView view) {
        WebSettings settings = view.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setLoadWithOverviewMode(true);
        settings.setUseWideViewPort(true);
        settings.setSupportZoom(false);
        settings.setSupportMultipleWindows(false);
        settings.setUserAgentString(settings.getUserAgentString() + " SCGSProbe/" + APP_DISPLAY_VERSION);

        CookieManager cookieManager = CookieManager.getInstance();
        cookieManager.setAcceptCookie(true);
        cookieManager.setAcceptThirdPartyCookies(view, true);

        view.setWebViewClient(new ProbeWebViewClient());
        view.setWebChromeClient(new ProbeChromeClient());
    }

    private final class ProbeWebViewClient extends WebViewClient {
        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            return handleUrl(request.getUrl());
        }

        @Override
        public boolean shouldOverrideUrlLoading(WebView view, String url) {
            return handleUrl(Uri.parse(url));
        }

        @Override
        public void onPageStarted(WebView view, String url, Bitmap favicon) {
            statusText.setText(shortStatus(url));
            progressBar.setVisibility(View.VISIBLE);
            if (isNospoilHost(Uri.parse(url))) {
                enterNospoilViewingMode();
                showNospoilShield();
            } else {
                exitNospoilViewingMode();
                hideNospoilShield();
            }
        }

        @Override
        public void onPageFinished(WebView view, String url) {
            statusText.setText(shortStatus(url));
            if (isSiteHost(Uri.parse(url))) {
                injectSiteLinkHandler(view);
            }
            if (isNospoilHost(Uri.parse(url))) {
                enterNospoilViewingMode();
                injectNospoilRules(view, () -> webContainer.postDelayed(() -> hideNospoilShield(), 2200));
            } else {
                exitNospoilViewingMode();
                hideNospoilShield();
            }
        }
    }

    private boolean handleUrl(Uri uri) {
        if (uri == null) return false;

        String scheme = safeLower(uri.getScheme());
        if (!"http".equals(scheme) && !"https".equals(scheme)) {
            Log.i(TAG, "Block non-http(s) navigation: " + uri);
            return true;
        }

        if (isInAppHost(uri)) {
            if (isNospoilHost(uri)) {
                enterNospoilViewingMode();
                showNospoilShield();
            }
            return false;
        }

        Log.i(TAG, "Block external navigation: " + uri);
        return true;
    }

    private boolean shouldSuppressExternalAppPrompt(Uri uri) {
        String scheme = safeLower(uri.getScheme());
        if (scheme.isEmpty()) return false;

        for (String appScheme : XIAOHONGSHU_APP_SCHEMES) {
            if (appScheme.equals(scheme)) {
                return true;
            }
        }

        if ("intent".equals(scheme)) {
            String raw = safeLower(uri.toString());
            return raw.contains("xiaohongshu")
                    || raw.contains("xhsdiscover")
                    || raw.contains("xhslink")
                    || raw.contains("com.xingin.xhs");
        }

        return false;
    }

    private boolean isInAppHost(Uri uri) {
        String host = safeLower(uri.getHost());
        return hostMatchesAny(host, IN_APP_HOST_SUFFIXES);
    }

    private boolean isNospoilHost(Uri uri) {
        String host = safeLower(uri.getHost());
        if (hostMatchesAny(host, NOSPOIL_HOST_SUFFIXES)) {
            return true;
        }

        if (hostMatches(host, "xiaohongshu.com")) {
            String path = safeLower(uri.getPath());
            return path.startsWith("/explore/") || path.startsWith("/discovery/item/");
        }

        return false;
    }

    private boolean isSiteHost(Uri uri) {
        String host = safeLower(uri.getHost());
        return hostMatches(host, "scgs.tv");
    }

    private void injectNospoilRules(WebView view, Runnable afterInjected) {
        if (nospoilCss == null || nospoilJs == null) {
            Log.w(TAG, "No-spoiler assets missing, skip injection");
            if (afterInjected != null) {
                afterInjected.run();
            }
            return;
        }

        String script = "(function(){"
                + "if(!document.getElementById('scgs-android-probe-style')){"
                + "var style=document.createElement('style');"
                + "style.id='scgs-android-probe-style';"
                + "style.textContent=" + jsString(nospoilCss) + ";"
                + "document.documentElement.appendChild(style);"
                + "}"
                + "window.__SCGS_ANDROID_PROBE__={injectedAt:Date.now(),host:location.host};"
                + nospoilJs
                + androidNospoilPatchScript()
                + "})();";

        view.evaluateJavascript(script, value -> {
            Log.i(TAG, "No-spoiler injection result: " + value);
            if (afterInjected != null) {
                afterInjected.run();
            }
        });
    }

    private void showNospoilShield() {
        if (nospoilShield != null) {
            nospoilShield.bringToFront();
            nospoilShield.setVisibility(View.VISIBLE);
        }
    }

    private void hideNospoilShield() {
        if (nospoilShield != null) {
            nospoilShield.setVisibility(View.GONE);
        }
    }

    private void enterNospoilViewingMode() {
        nospoilViewingMode = true;
        setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE);
        toolbar.setVisibility(View.GONE);
        progressBar.setVisibility(View.GONE);
        promoteWebContainerToRoot();
        enterImmersiveMode();
    }

    private void exitNospoilViewingMode() {
        nospoilViewingMode = false;
        if (fullscreenView == null) {
            restoreWebContainerToShell();
            setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED);
            toolbar.setVisibility(View.VISIBLE);
            exitImmersiveMode();
        }
    }

    private void promoteWebContainerToRoot() {
        if (webContainer == null || root == null) return;
        if (webContainer.getParent() == root) {
            webContainer.bringToFront();
            webContainer.setLayoutParams(new FrameLayout.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT,
                    ViewGroup.LayoutParams.MATCH_PARENT
            ));
            return;
        }

        ViewGroup parent = (ViewGroup) webContainer.getParent();
        if (parent != null) {
            parent.removeView(webContainer);
        }
        root.addView(webContainer, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
        ));
        webContainer.bringToFront();
    }

    private void restoreWebContainerToShell() {
        if (webContainer == null || shell == null) return;
        if (webContainer.getParent() == shell) return;

        ViewGroup parent = (ViewGroup) webContainer.getParent();
        if (parent != null) {
            parent.removeView(webContainer);
        }
        shell.addView(webContainer, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                0,
                1
        ));
    }

    private void enterImmersiveMode() {
        getWindow().getDecorView().setSystemUiVisibility(
                View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                        | View.SYSTEM_UI_FLAG_FULLSCREEN
                        | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                        | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                        | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                        | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
        );
    }

    private void exitImmersiveMode() {
        getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_LAYOUT_STABLE);
    }

    private void injectSiteLinkHandler(WebView view) {
        String script = "(function(){"
                + "if(window.__SCGS_ANDROID_LINK_HANDLER__)return;"
                + "window.__SCGS_ANDROID_LINK_HANDLER__=true;"
                + "document.addEventListener('click',function(event){"
                + "var link=event.target.closest&&event.target.closest('a[href]');"
                + "if(!link)return;"
                + "var href=link.href;"
                + "if(!href)return;"
                + "event.preventDefault();"
                + "location.href=href;"
                + "},true);"
                + "})();";
        view.evaluateJavascript(script, value -> Log.i(TAG, "Site link handler injected"));
    }

    private String androidNospoilPatchScript() {
        return "(function(){"
                + "if(window.__SCGS_ANDROID_NOSPOIL_PATCH__)return;"
                + "window.__SCGS_ANDROID_NOSPOIL_PATCH__=true;"
                + "var STYLE_ID='scgs-android-nospoil-style';"
                + "function hostOk(){return /(^|\\.)(cctv\\.com|cntv\\.cn|yangshipin\\.cn)$/.test(location.hostname);}"
                + "function rectArea(el){var r=el.getBoundingClientRect();return Math.max(0,r.width)*Math.max(0,r.height);}"
                + "function largestMediaRoot(){"
                + "var media=Array.prototype.slice.call(document.querySelectorAll('video,iframe,object,embed'));"
                + "var best=null,bestArea=0;"
                + "media.forEach(function(el){var area=rectArea(el);if(area>bestArea){best=el;bestArea=area;}});"
                + "if(!best)return null;"
                + "var root=best;"
                + "for(var i=0;i<4&&root.parentElement&&root.parentElement!==document.body;i++){"
                + "var parent=root.parentElement,pr=parent.getBoundingClientRect(),rr=root.getBoundingClientRect();"
                + "if(pr.width>=rr.width&&pr.height>=rr.height&&pr.width<window.innerWidth*1.4&&pr.height<window.innerHeight*1.4){root=parent;}else{break;}"
                + "}"
                + "return root;"
                + "}"
                + "function installStyle(){"
                + "if(document.getElementById(STYLE_ID))return;"
                + "var style=document.createElement('style');style.id=STYLE_ID;"
                + "style.textContent='html.scgs-android-nospoil,html.scgs-android-nospoil body{margin:0!important;padding:0!important;width:100vw!important;height:100vh!important;min-width:100vw!important;min-height:100vh!important;overflow:hidden!important;background:#000!important;transform:none!important;}'"
                + "+'html.scgs-android-nospoil #myflash,html.scgs-android-nospoil .scgs-android-player-root{position:fixed!important;inset:0!important;width:100vw!important;height:100vh!important;min-width:100vw!important;min-height:100vh!important;max-width:none!important;max-height:none!important;margin:0!important;padding:0!important;border:0!important;background:#000!important;z-index:2147483000!important;overflow:hidden!important;}'"
                + "+'html.scgs-android-nospoil .scgs-android-player-shell{position:fixed!important;inset:0!important;width:100vw!important;height:100vh!important;min-width:100vw!important;min-height:100vh!important;max-width:none!important;max-height:none!important;margin:0!important;padding:0!important;border:0!important;background:#000!important;overflow:hidden!important;z-index:2147482999!important;}'"
                + "+'html.scgs-android-nospoil #myflash *,html.scgs-android-nospoil .scgs-android-player-root *,html.scgs-android-nospoil .scgs-android-player-root video,html.scgs-android-nospoil .scgs-android-player-root iframe,html.scgs-android-nospoil .scgs-android-player-root object,html.scgs-android-nospoil .scgs-android-player-root embed{width:100%!important;height:100%!important;min-width:100%!important;min-height:100%!important;max-width:none!important;max-height:none!important;margin:0!important;padding:0!important;border:0!important;background:#000!important;object-fit:contain!important;}'"
                + "+'html.scgs-android-nospoil .scgs-android-hide{display:none!important;visibility:hidden!important;}';"
                + "document.documentElement.appendChild(style);"
                + "}"
                + "function markShell(root){"
                + "var el=root&&root.parentElement;"
                + "for(var i=0;i<4&&el&&el!==document.body;i++,el=el.parentElement){el.classList.add('scgs-android-player-shell');}"
                + "}"
                + "function hideAround(root){"
                + "if(!root||!document.body)return;"
                + "Array.prototype.slice.call(document.body.querySelectorAll('*')).forEach(function(el){"
                + "if(el===root||root.contains(el)||el.contains(root)||el.id==='nospoil-worldcup-notice')return;"
                + "var r=el.getBoundingClientRect();"
                + "if(r.width>2&&r.height>2){el.classList.add('scgs-android-hide');}"
                + "});"
                + "}"
                + "function apply(){"
                + "if(!hostOk()||!document.documentElement||!document.body)return;"
                + "installStyle();"
                + "document.documentElement.classList.add('scgs-android-nospoil');"
                + "var root=document.querySelector('#myflash')||document.querySelector('.scgs-android-player-root')||largestMediaRoot();"
                + "if(root){root.classList.add('scgs-android-player-root');markShell(root);hideAround(root);"
                + "var target=root.querySelector&&(root.querySelector('video')||root.querySelector('iframe'))||root;"
                + "try{var fn=target&&(target.requestFullscreen||target.webkitRequestFullscreen||target.webkitRequestFullScreen||target.mozRequestFullScreen||target.msRequestFullscreen);if(fn){var ret=fn.call(target);if(ret&&ret.catch)ret.catch(function(){});}}catch(e){}"
                + "}"
                + "}"
                + "apply();"
                + "[80,250,600,1200,2200,4000,7000].forEach(function(delay){setTimeout(apply,delay);});"
                + "new MutationObserver(function(){requestAnimationFrame(apply);}).observe(document.documentElement,{childList:true,subtree:true});"
                + "})();";
    }

    private final class ProbeChromeClient extends WebChromeClient {
        @Override
        public void onProgressChanged(WebView view, int newProgress) {
            progressBar.setProgress(newProgress);
            progressBar.setVisibility(newProgress >= 100 ? View.GONE : View.VISIBLE);
        }

        @Override
        public boolean onConsoleMessage(ConsoleMessage consoleMessage) {
            Log.d(TAG, consoleMessage.messageLevel() + ": " + consoleMessage.message());
            return true;
        }

        @Override
        public boolean onJsAlert(WebView view, String url, String message, JsResult result) {
            result.cancel();
            return true;
        }

        @Override
        public boolean onJsConfirm(WebView view, String url, String message, JsResult result) {
            result.cancel();
            return true;
        }

        @Override
        public boolean onJsPrompt(WebView view, String url, String message, String defaultValue, JsPromptResult result) {
            result.cancel();
            return true;
        }

        @Override
        public boolean onCreateWindow(WebView view, boolean isDialog, boolean isUserGesture, Message resultMsg) {
            Log.i(TAG, "Block new window request");
            if (resultMsg != null && resultMsg.obj instanceof WebView.WebViewTransport) {
                ((WebView.WebViewTransport) resultMsg.obj).setWebView(null);
                resultMsg.sendToTarget();
            }
            return true;
        }

        @Override
        public void onShowCustomView(View view, WebChromeClient.CustomViewCallback callback) {
            if (fullscreenView != null) {
                callback.onCustomViewHidden();
                return;
            }

            fullscreenView = view;
            fullscreenCallback = callback;
            setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE);
            enterImmersiveMode();
            toolbar.setVisibility(View.GONE);
            progressBar.setVisibility(View.GONE);
            webView.setVisibility(View.GONE);
            root.addView(fullscreenView, new FrameLayout.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT,
                    ViewGroup.LayoutParams.MATCH_PARENT
            ));
        }

        @Override
        public void onHideCustomView() {
            hideFullscreenView();
        }
    }

    private void hideFullscreenView() {
        if (fullscreenView == null) return;

        root.removeView(fullscreenView);
        fullscreenView = null;
        webView.setVisibility(View.VISIBLE);
        if (nospoilViewingMode) {
            toolbar.setVisibility(View.GONE);
            enterImmersiveMode();
        } else {
            toolbar.setVisibility(View.VISIBLE);
            setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED);
            exitImmersiveMode();
        }

        if (fullscreenCallback != null) {
            fullscreenCallback.onCustomViewHidden();
            fullscreenCallback = null;
        }
    }

    @Override
    public void onBackPressed() {
        if (fullscreenView != null) {
            hideFullscreenView();
        } else if (webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }

    @Override
    protected void onDestroy() {
        if (webView != null) {
            webView.destroy();
        }
        super.onDestroy();
    }

    private String readAsset(String assetPath) {
        try (InputStream input = getAssets().open(assetPath);
             BufferedReader reader = new BufferedReader(new InputStreamReader(input, StandardCharsets.UTF_8))) {
            StringBuilder builder = new StringBuilder();
            String line;
            while ((line = reader.readLine()) != null) {
                builder.append(line).append('\n');
            }
            return builder.toString();
        } catch (IOException err) {
            Log.e(TAG, "Failed to read asset: " + assetPath, err);
            return null;
        }
    }

    private String shortStatus(String url) {
        Uri uri = Uri.parse(url);
        String host = uri.getHost();
        if (host == null) return "加载中";
        if (isNospoilHost(uri)) return "净屏调研：" + host;
        return host;
    }

    private String safeLower(String value) {
        return value == null ? "" : value.toLowerCase(Locale.ROOT);
    }

    private boolean hostMatchesAny(String host, String[] suffixes) {
        for (String suffix : suffixes) {
            if (hostMatches(host, suffix)) {
                return true;
            }
        }
        return false;
    }

    private boolean hostMatches(String host, String suffix) {
        return host.equals(suffix) || host.endsWith("." + suffix);
    }

    private int dpToPx(int dp) {
        return Math.round(dp * getResources().getDisplayMetrics().density);
    }

    private String jsString(String value) {
        StringBuilder builder = new StringBuilder("\"");
        for (int i = 0; i < value.length(); i++) {
            char c = value.charAt(i);
            switch (c) {
                case '\\':
                    builder.append("\\\\");
                    break;
                case '"':
                    builder.append("\\\"");
                    break;
                case '\n':
                    builder.append("\\n");
                    break;
                case '\r':
                    builder.append("\\r");
                    break;
                case '\t':
                    builder.append("\\t");
                    break;
                default:
                    builder.append(c);
            }
        }
        builder.append('"');
        return builder.toString();
    }
}
