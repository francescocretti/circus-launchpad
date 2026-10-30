package expo.modules.audiooutput

import android.content.Context
import android.media.AudioAttributes
import android.media.AudioDeviceCallback
import android.media.AudioDeviceInfo
import android.media.AudioManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

// Uscita audio effettiva per la musica e avvisi quando si collega o scollega un dispositivo (spec §11, D-25).
// react-native-audio-api su Android non espone l'uscita attuale né gli eventi di cambio.
class AudioOutputModule : Module() {
  private val audioManager: AudioManager
    get() = appContext.reactContext!!.getSystemService(Context.AUDIO_SERVICE) as AudioManager

  private val callback = object : AudioDeviceCallback() {
    override fun onAudioDevicesAdded(addedDevices: Array<out AudioDeviceInfo>) = notifyChange()
    override fun onAudioDevicesRemoved(removedDevices: Array<out AudioDeviceInfo>) = notifyChange()
  }

  override fun definition() = ModuleDefinition {
    Name("AudioOutput")
    Events(CHANGE_EVENT)

    Function("getCurrent") { current() }

    OnStartObserving {
      audioManager.registerAudioDeviceCallback(callback, Handler(Looper.getMainLooper()))
    }
    OnStopObserving {
      audioManager.unregisterAudioDeviceCallback(callback)
    }
  }

  private fun notifyChange() {
    // Il routing si assesta dopo l'evento: spegnendo il Bluetooth del Pixel 7a la musica resta sul Bluetooth per
    // ~1,1 s. Si rilegge più volte; le letture uguali non evidenziano niente (useAudioOutput).
    for (ms in REREAD_MS) Handler(Looper.getMainLooper()).postDelayed({ sendEvent(CHANGE_EVENT, current()) }, ms)
  }

  private fun current(): Map<String, Any?> {
    val device = mediaDevice()
    return mapOf("kind" to kindOf(device?.type), "name" to device?.productName?.toString(), "type" to device?.type)
  }

  private fun mediaDevice(): AudioDeviceInfo? {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      val attrs = AudioAttributes.Builder()
        .setUsage(AudioAttributes.USAGE_MEDIA)
        .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
        .build()
      audioManager.getAudioDevicesForAttributes(attrs).firstOrNull()?.let { return it }
    }
    // Sotto Android 13: Android instrada la musica sull'ultimo dispositivo esterno collegato; in pratica basta
    // una priorità fissa.
    val outputs = audioManager.getDevices(AudioManager.GET_DEVICES_OUTPUTS)
    return PRIORITY.firstNotNullOfOrNull { kind -> outputs.firstOrNull { kindOf(it.type) == kind } }
  }

  companion object {
    const val CHANGE_EVENT = "onChange"
    val REREAD_MS = listOf(300L, 1500L, 3000L)
    val PRIORITY = listOf("usb", "wired", "bluetooth", "speaker")

    fun kindOf(type: Int?): String = when (type) {
      AudioDeviceInfo.TYPE_USB_DEVICE, AudioDeviceInfo.TYPE_USB_HEADSET, AudioDeviceInfo.TYPE_USB_ACCESSORY,
      AudioDeviceInfo.TYPE_DOCK -> "usb"
      AudioDeviceInfo.TYPE_WIRED_HEADSET, AudioDeviceInfo.TYPE_WIRED_HEADPHONES, AudioDeviceInfo.TYPE_LINE_ANALOG,
      AudioDeviceInfo.TYPE_LINE_DIGITAL, AudioDeviceInfo.TYPE_AUX_LINE -> "wired"
      AudioDeviceInfo.TYPE_BLUETOOTH_A2DP, AudioDeviceInfo.TYPE_BLUETOOTH_SCO, AudioDeviceInfo.TYPE_BLE_HEADSET,
      AudioDeviceInfo.TYPE_BLE_SPEAKER, AudioDeviceInfo.TYPE_BLE_BROADCAST, AudioDeviceInfo.TYPE_HEARING_AID -> "bluetooth"
      AudioDeviceInfo.TYPE_BUILTIN_SPEAKER, AudioDeviceInfo.TYPE_BUILTIN_EARPIECE,
      AudioDeviceInfo.TYPE_BUILTIN_SPEAKER_SAFE -> "speaker"
      null -> "unknown"
      else -> "other"
    }
  }
}
