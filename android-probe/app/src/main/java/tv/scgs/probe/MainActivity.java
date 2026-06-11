package tv.scgs.probe;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
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
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;
import android.widget.Toast;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.HashSet;
import java.util.Locale;
import java.util.Set;

public class MainActivity extends Activity {
    private static final String TAG = "SCGSProbe";
    private static final String HOME_URL = "https://scgs.tv/";
    private static final int TOOLBAR_HORIZONTAL_PADDING_DP = 16;
    private static final int TOOLBAR_TOP_PADDING_DP = 8;
    private static final int TOOLBAR_BOTTOM_PADDING_DP = 8;
    private static final Set<String> IN_APP_HOSTS = new HashSet<>(Arrays.asList(
            "scgs.tv",
            "www.scgs.tv",
            "worldcup.cctv.com"
    ));

    private FrameLayout root;
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
        LinearLayout shell = new LinearLayout(this);
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
        statusText.setText("时差观赛调研版");
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
        settings.setSupportMultipleWindows(true);
        settings.setUserAgentString(settings.getUserAgentString() + " SCGSProbe/0.1");

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
                injectNospoilRules(view, () -> hideNospoilShield());
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
            openExternal(uri);
            return true;
        }

        if (isInAppHost(uri)) {
            if (isNospoilHost(uri)) {
                enterNospoilViewingMode();
                showNospoilShield();
            }
            return false;
        }

        openExternal(uri);
        return true;
    }

    private boolean isInAppHost(Uri uri) {
        String host = safeLower(uri.getHost());
        return IN_APP_HOSTS.contains(host);
    }

    private boolean isNospoilHost(Uri uri) {
        return "worldcup.cctv.com".equals(safeLower(uri.getHost()));
    }

    private boolean isSiteHost(Uri uri) {
        String host = safeLower(uri.getHost());
        return "scgs.tv".equals(host) || "www.scgs.tv".equals(host);
    }

    private void openExternal(Uri uri) {
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, uri));
        } catch (ActivityNotFoundException err) {
            Toast.makeText(this, "无法打开外部链接", Toast.LENGTH_SHORT).show();
        }
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
        enterImmersiveMode();
    }

    private void exitNospoilViewingMode() {
        nospoilViewingMode = false;
        if (fullscreenView == null) {
            setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED);
            toolbar.setVisibility(View.VISIBLE);
            exitImmersiveMode();
        }
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
        public boolean onCreateWindow(WebView view, boolean isDialog, boolean isUserGesture, Message resultMsg) {
            WebView popup = new WebView(MainActivity.this);
            configureWebView(popup);
            popup.setWebViewClient(new WebViewClient() {
                @Override
                public boolean shouldOverrideUrlLoading(WebView popupView, WebResourceRequest request) {
                    Uri uri = request.getUrl();
                    if (isInAppHost(uri)) {
                        webView.loadUrl(uri.toString());
                    } else {
                        openExternal(uri);
                    }
                    popup.destroy();
                    return true;
                }

                @Override
                public boolean shouldOverrideUrlLoading(WebView popupView, String url) {
                    Uri uri = Uri.parse(url);
                    if (isInAppHost(uri)) {
                        webView.loadUrl(uri.toString());
                    } else {
                        openExternal(uri);
                    }
                    popup.destroy();
                    return true;
                }
            });

            WebView.WebViewTransport transport = (WebView.WebViewTransport) resultMsg.obj;
            transport.setWebView(popup);
            resultMsg.sendToTarget();
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
