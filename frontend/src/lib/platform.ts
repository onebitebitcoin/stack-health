export function isFlutterWebView(): boolean {
  return /flutter|StackHealth/i.test(navigator.userAgent)
}
