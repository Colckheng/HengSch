package com.hengsch.todo

import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

/** JS → 原生：写入小组件摘要并刷新所有实例 */
class WidgetBridgeModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {
    override fun getName(): String = "WidgetBridge"

    @ReactMethod
    fun setSummary(json: String) {
        WidgetSummaryStore.write(reactApplicationContext, json)
    }
}
