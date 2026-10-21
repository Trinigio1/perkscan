package expo.modules.sharetext

import android.content.Intent
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Receives text shared into PerkScan from another app (Messages → Share → PerkScan).
 * Only text the user explicitly shares arrives here; PerkScan never reads the SMS inbox.
 */
class ShareTextModule : Module() {
  // Text from a share that arrived while the app was running, until JS takes it.
  private var pending: String? = null

  private fun textFrom(intent: Intent?): String? {
    if (intent == null || intent.action != Intent.ACTION_SEND) return null
    if (intent.type?.startsWith("text/") != true) return null
    return intent.getStringExtra(Intent.EXTRA_TEXT)?.takeIf { it.isNotBlank() }
  }

  override fun definition() = ModuleDefinition {
    Name("ShareText")

    Events("onShare")

    // Returns the shared text once, then forgets it so it isn't handled twice.
    Function("takeSharedText") {
      val activityIntent = appContext.currentActivity?.intent
      val text = pending ?: textFrom(activityIntent)
      pending = null
      if (textFrom(activityIntent) != null) {
        activityIntent?.removeExtra(Intent.EXTRA_TEXT)
      }
      text
    }

    OnNewIntent { intent ->
      textFrom(intent)?.let {
        pending = it
        sendEvent("onShare", mapOf("text" to it))
      }
    }
  }
}
