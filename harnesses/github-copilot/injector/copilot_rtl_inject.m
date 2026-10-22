// ===========================================================================
// copilot_rtl_inject.dylib — WKWebView script injector for GitHub Copilot.app
//
// What it does:
//   Hooks WKWebView creation (initWithFrame:configuration: + initWithCoder:)
//   and attaches a WKUserScript (payload/copilot-rtl-payload.js, built with
//   embedded Vazirmatn fonts) to every web view, so the RTL patch applies to
//   all chat surfaces without modifying the app bundle's code.
//
// Requirements:
//   The app must be ad-hoc re-signed (patch.sh) to drop the Hardened Runtime
//   + Library Validation, otherwise DYLD_INSERT_LIBRARIES is ignored.
//   No SIP disabling is needed for a regular /Applications app.
//
// Build: ./build.sh
// Run:   ./launch-copilot-rtl.sh
// ===========================================================================
#import <Foundation/Foundation.h>
#import <WebKit/WebKit.h>
#import <objc/runtime.h>
#import <dlfcn.h>

static NSString *CopilotRTLPayloadSource(void) {
    static NSString *cached = nil;
    static dispatch_once_t once;
    dispatch_once(&once, ^{
        // 1) Same directory as this dylib (installed: Contents/Frameworks/CopilotRTL/)
        Dl_info info;
        NSString *payloadPath = nil;
        if (dladdr((const void *)CopilotRTLPayloadSource, &info) && info.dli_fname) {
            NSString *dir = [[NSString stringWithUTF8String:info.dli_fname] stringByDeletingLastPathComponent];
            payloadPath = [dir stringByAppendingPathComponent:@"copilot-rtl-payload.js"];
        }
        // 2) Installed layout only: payload next to the dylib.
        //    A missing payload is reported at runtime; no machine-specific
        //    absolute path is embedded in the binary.
        NSArray *candidates = @[ payloadPath ?: @"" ];
        for (NSString *p in candidates) {
            if (p.length == 0) continue;
            NSError *err = nil;
            NSString *src = [NSString stringWithContentsOfFile:p encoding:NSUTF8StringEncoding error:&err];
            if (src && src.length > 1000) { cached = src; break; }
        }
        if (!cached) {
            NSLog(@"[CopilotRTL] ERROR: payload JS not found; RTL patch inactive.");
            cached = @"";
        } else {
            NSLog(@"[CopilotRTL] payload loaded (%lu bytes)", (unsigned long)cached.length);
        }
    });
    return cached;
}

static void CopilotRTLAttach(WKWebView *webView) {
    if (!webView) return;
    @try {
        WKUserContentController *ucc = webView.configuration.userContentController;
        if (!ucc) return;
        // Avoid double-injection if both inits run on the same instance.
        for (WKUserScript *s in ucc.userScripts) {
            if ([s.source rangeOfString:@"copilot-rtl-styles"].location != NSNotFound) return;
        }
        NSString *src = CopilotRTLPayloadSource();
        if (src.length == 0) return;
        WKUserScript *script = [[WKUserScript alloc]
            initWithSource:src
            injectionTime:WKUserScriptInjectionTimeAtDocumentStart
            forMainFrameOnly:NO];
        [ucc addUserScript:script];
        NSLog(@"[CopilotRTL] injected into WKWebView %p", webView);
    } @catch (NSException *e) {
        NSLog(@"[CopilotRTL] attach failed: %@", e);
    }
}

// ---- Swizzled inits ---------------------------------------------------------
@interface WKWebView (CopilotRTL)
- (instancetype)copilotrtl_initWithFrame:(CGRect)frame configuration:(WKWebViewConfiguration *)configuration;
- (instancetype)copilotrtl_initWithCoder:(NSCoder *)coder;
@end

@implementation WKWebView (CopilotRTL)
- (instancetype)copilotrtl_initWithFrame:(CGRect)frame configuration:(WKWebViewConfiguration *)configuration {
    WKWebView *wv = [self copilotrtl_initWithFrame:frame configuration:configuration];
    CopilotRTLAttach(wv);
    return wv;
}
- (instancetype)copilotrtl_initWithCoder:(NSCoder *)coder {
    WKWebView *wv = [self copilotrtl_initWithCoder:coder];
    CopilotRTLAttach(wv);
    return wv;
}
@end

__attribute__((constructor)) static void CopilotRTLInit(void) {
    @autoreleasepool {
        Class cls = objc_getClass("WKWebView");
        if (!cls) { NSLog(@"[CopilotRTL] WKWebView class not found"); return; }

        SEL selA = @selector(initWithFrame:configuration:);
        SEL selB = @selector(copilotrtl_initWithFrame:configuration:);
        Method mA = class_getInstanceMethod(cls, selA);
        Method mB = class_getInstanceMethod((Class)objc_getClass("WKWebView(CopilotRTL)") ?: cls, selB);
        // mB lives in our category on WKWebView, so fetch from cls as well:
        if (!mB) mB = class_getInstanceMethod(cls, selB);
        if (mA && mB) {
            method_exchangeImplementations(mA, mB);
            NSLog(@"[CopilotRTL] hooked -initWithFrame:configuration:");
        } else {
            NSLog(@"[CopilotRTL] hook A missing (mA=%p mB=%p)", mA, mB);
        }

        SEL selC = @selector(initWithCoder:);
        SEL selD = @selector(copilotrtl_initWithCoder:);
        Method mC = class_getInstanceMethod(cls, selC);
        Method mD = class_getInstanceMethod(cls, selD);
        if (mC && mD) {
            method_exchangeImplementations(mC, mD);
            NSLog(@"[CopilotRTL] hooked -initWithCoder:");
        } else {
            NSLog(@"[CopilotRTL] hook C missing (mC=%p mD=%p)", mC, mD);
        }
    }
}
