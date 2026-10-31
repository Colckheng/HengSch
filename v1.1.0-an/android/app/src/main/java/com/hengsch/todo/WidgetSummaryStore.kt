package com.hengsch.todo

import android.content.Context
import org.json.JSONObject

/** 小组件只读摘要的本地存储；由 JS 侧通过 WidgetBridge 写入 */
object WidgetSummaryStore {
    private const val PREFS = "hengsch_widget"
    private const val KEY = "summary"

    data class Summary(val pendingCount: Int, val topTitles: List<String>, val updatedAt: Long)

    fun write(context: Context, json: String) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit()
            .putString(KEY, json)
            .apply()
        TodoWidgetProvider.refreshAll(context)
    }

    fun read(context: Context): Summary {
        val raw = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY, null)
        if (raw.isNullOrBlank()) return Summary(0, emptyList(), 0)
        return try {
            val obj = JSONObject(raw)
            val titles = obj.optJSONArray("topTitles")
            val list = ArrayList<String>()
            if (titles != null) {
                for (i in 0 until titles.length()) list.add(titles.optString(i))
            }
            Summary(obj.optInt("pendingCount", 0), list, obj.optLong("updatedAt", 0))
        } catch (error: Exception) {
            Summary(0, emptyList(), 0)
        }
    }
}
