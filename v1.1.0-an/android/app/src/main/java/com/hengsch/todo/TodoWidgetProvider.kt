package com.hengsch.todo

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.widget.RemoteViews
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/** 只读小组件：今日待办数 + 前 3 条标题 + 更新时间；点击打开应用 */
class TodoWidgetProvider : AppWidgetProvider() {
    override fun onUpdate(context: Context, appWidgetManager: AppWidgetManager, appWidgetIds: IntArray) {
        val summary = WidgetSummaryStore.read(context)
        for (id in appWidgetIds) {
            appWidgetManager.updateAppWidget(id, buildViews(context, summary))
        }
    }

    companion object {
        fun refreshAll(context: Context) {
            val manager = AppWidgetManager.getInstance(context)
            val ids = manager.getAppWidgetIds(ComponentName(context, TodoWidgetProvider::class.java))
            if (ids.isEmpty()) return
            val summary = WidgetSummaryStore.read(context)
            for (id in ids) manager.updateAppWidget(id, buildViews(context, summary))
        }

        private fun buildViews(context: Context, summary: WidgetSummaryStore.Summary): RemoteViews {
            val views = RemoteViews(context.packageName, R.layout.widget_todo)
            views.setTextViewText(R.id.widget_count, String.format(Locale.US, "%02d", summary.pendingCount))

            val rowIds = intArrayOf(R.id.widget_row_1, R.id.widget_row_2, R.id.widget_row_3)
            for (index in rowIds.indices) {
                val title = summary.topTitles.getOrNull(index)
                views.setTextViewText(rowIds[index], title ?: if (index == 0) "暂无待办" else "")
            }

            val time = if (summary.updatedAt > 0) {
                SimpleDateFormat("HH:mm", Locale.getDefault()).format(Date(summary.updatedAt))
            } else {
                "--:--"
            }
            views.setTextViewText(R.id.widget_updated, "UPDATED $time")

            val intent = Intent(context, MainActivity::class.java)
            val pending = PendingIntent.getActivity(
                context,
                0,
                intent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
            views.setOnClickPendingIntent(R.id.widget_root, pending)
            return views
        }
    }
}
