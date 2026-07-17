package com.countdowntimer.app

import android.net.wifi.WifiManager
import android.util.Log
import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule
import java.net.*
import java.nio.charset.StandardCharsets
import java.util.concurrent.atomic.AtomicBoolean
import kotlin.concurrent.thread

/**
 * UDP LAN P2P module — primary classroom communication over local Wi-Fi.
 * Teacher broadcasts on LAN_BROADCAST_PORT; students listen and reply with ACKs on LAN_ACK_PORT.
 */
class LanP2PModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    companion object {
        const val LAN_BROADCAST_PORT = 47809
        const val LAN_ACK_PORT = 47810
        private const val TAG = "LanP2PModule"
        private const val MAX_PACKET = 65507
    }

    private var listenSocket: DatagramSocket? = null
    private var ackListenSocket: DatagramSocket? = null
    private val listening = AtomicBoolean(false)
    private val ackListening = AtomicBoolean(false)
    private var multicastLock: WifiManager.MulticastLock? = null

    override fun getName(): String = "LanP2PModule"

    private fun acquireMulticastLock() {
        try {
            val wifi = reactContext.applicationContext.getSystemService(WifiManager::class.java)
            if (wifi != null && multicastLock == null) {
                multicastLock = wifi.createMulticastLock("LanP2P").apply {
                    setReferenceCounted(true)
                    acquire()
                }
            }
        } catch (e: Exception) {
            Log.w(TAG, "MulticastLock failed: ${e.message}")
        }
    }

    private fun releaseMulticastLock() {
        try {
            multicastLock?.let {
                if (it.isHeld) it.release()
            }
            multicastLock = null
        } catch (_: Exception) {}
    }

    @ReactMethod
    fun getLocalIpAddress(promise: Promise) {
        try {
            promise.resolve(getLocalIp())
        } catch (e: Exception) {
            promise.reject("IP_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun startListening(promise: Promise) {
        if (listening.get()) {
            promise.resolve(true)
            return
        }
        try {
            acquireMulticastLock()
            // reuseAddress / broadcast MUST be set before bind to take effect.
            // DatagramSocket(port) binds in its constructor, so build it unbound first.
            val socket = DatagramSocket(null)
            socket.reuseAddress = true
            socket.broadcast = true
            socket.bind(InetSocketAddress(LAN_BROADCAST_PORT))
            listenSocket = socket
            listening.set(true)

            thread(name = "LanP2P-Receive", isDaemon = true) {
                val buf = ByteArray(MAX_PACKET)
                while (listening.get()) {
                    try {
                        val packet = DatagramPacket(buf, buf.size)
                        socket.receive(packet)
                        val msg = String(packet.data, 0, packet.length, StandardCharsets.UTF_8)
                        val senderIp = packet.address.hostAddress ?: "unknown"
                        val map = Arguments.createMap()
                        map.putString("message", msg)
                        map.putString("senderIp", senderIp)
                        map.putInt("senderPort", packet.port)
                        emit("onLanPacketReceived", map)
                    } catch (e: SocketException) {
                        if (listening.get()) Log.w(TAG, "Receive socket error: ${e.message}")
                        break
                    } catch (e: Exception) {
                        Log.w(TAG, "Receive error: ${e.message}")
                    }
                }
            }
            promise.resolve(true)
        } catch (e: Exception) {
            listening.set(false)
            promise.reject("LISTEN_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun startAckListening(promise: Promise) {
        if (ackListening.get()) {
            promise.resolve(true)
            return
        }
        try {
            val socket = DatagramSocket(null)
            socket.reuseAddress = true
            socket.bind(InetSocketAddress(LAN_ACK_PORT))
            ackListenSocket = socket
            ackListening.set(true)

            thread(name = "LanP2P-AckReceive", isDaemon = true) {
                val buf = ByteArray(MAX_PACKET)
                while (ackListening.get()) {
                    try {
                        val packet = DatagramPacket(buf, buf.size)
                        socket.receive(packet)
                        val msg = String(packet.data, 0, packet.length, StandardCharsets.UTF_8)
                        val senderIp = packet.address.hostAddress ?: "unknown"
                        val map = Arguments.createMap()
                        map.putString("message", msg)
                        map.putString("senderIp", senderIp)
                        emit("onLanAckReceived", map)
                    } catch (e: SocketException) {
                        if (ackListening.get()) Log.w(TAG, "ACK socket error: ${e.message}")
                        break
                    } catch (e: Exception) {
                        Log.w(TAG, "ACK receive error: ${e.message}")
                    }
                }
            }
            promise.resolve(true)
        } catch (e: Exception) {
            ackListening.set(false)
            promise.reject("ACK_LISTEN_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun stopListening(promise: Promise) {
        listening.set(false)
        ackListening.set(false)
        try { listenSocket?.close() } catch (_: Exception) {}
        try { ackListenSocket?.close() } catch (_: Exception) {}
        listenSocket = null
        ackListenSocket = null
        releaseMulticastLock()
        promise.resolve(true)
    }

    @ReactMethod
    fun broadcast(message: String, promise: Promise) {
        try {
            val data = message.toByteArray(StandardCharsets.UTF_8)
            val socket = DatagramSocket()
            socket.broadcast = true
            val broadcastAddr = getBroadcastAddress()
            val packet = DatagramPacket(data, data.size, broadcastAddr, LAN_BROADCAST_PORT)
            socket.send(packet)
            socket.close()
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("BROADCAST_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun sendUnicast(message: String, ip: String, port: Int, promise: Promise) {
        try {
            val data = message.toByteArray(StandardCharsets.UTF_8)
            val socket = DatagramSocket()
            val addr = InetAddress.getByName(ip)
            val packet = DatagramPacket(data, data.size, addr, port)
            socket.send(packet)
            socket.close()
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("UNICAST_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun sendAck(message: String, targetIp: String, promise: Promise) {
        try {
            val data = message.toByteArray(StandardCharsets.UTF_8)
            val socket = DatagramSocket()
            val addr = InetAddress.getByName(targetIp)
            val packet = DatagramPacket(data, data.size, addr, LAN_ACK_PORT)
            socket.send(packet)
            socket.close()
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("ACK_ERROR", e.message, e)
        }
    }

    private fun getLocalIp(): String {
        val interfaces = NetworkInterface.getNetworkInterfaces()
        while (interfaces.hasMoreElements()) {
            val ni = interfaces.nextElement()
            if (ni.isLoopback || !ni.isUp) continue
            val addrs = ni.inetAddresses
            while (addrs.hasMoreElements()) {
                val addr = addrs.nextElement()
                if (addr is Inet4Address && !addr.isLoopbackAddress) {
                    return addr.hostAddress ?: "0.0.0.0"
                }
            }
        }
        return "0.0.0.0"
    }

    private fun getBroadcastAddress(): InetAddress {
        try {
            val wifiManager =
                reactContext.applicationContext.getSystemService(WifiManager::class.java)
            val dhcp = wifiManager?.dhcpInfo
            if (dhcp != null && dhcp.ipAddress != 0) {
                val broadcast = (dhcp.ipAddress and dhcp.netmask) or dhcp.netmask.inv()
                val quads = ByteArray(4)
                for (k in 0..3) quads[k] = (broadcast shr (k * 8) and 0xFF).toByte()
                return InetAddress.getByAddress(quads)
            }
        } catch (e: Exception) {
            Log.w(TAG, "Broadcast addr fallback: ${e.message}")
        }
        return InetAddress.getByName("255.255.255.255")
    }

    private fun emit(event: String, params: WritableMap) {
        reactContext
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit(event, params)
    }

    override fun invalidate() {
        listening.set(false)
        ackListening.set(false)
        try { listenSocket?.close() } catch (_: Exception) {}
        try { ackListenSocket?.close() } catch (_: Exception) {}
        releaseMulticastLock()
        super.invalidate()
    }
}
