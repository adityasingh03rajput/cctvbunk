import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert, ScrollView, NativeModules, Animated, Easing } from 'react-native';
import { PermissionsAndroid, Platform } from 'react-native';
import WiFiManager from './WiFiManager';
import NativeWiFiService from './NativeWiFiService';
import BSSIDStorage from './BSSIDStorage';
import { SERVER_BASE_URL } from './config';
import { getServerTime } from './ServerTime';
import { GET_DAILY_BSSID_SCHEDULE } from './constants/apiEndpoints';
import { WiFiIcon, LocationIcon, ClockIcon, CheckIcon, XIcon, RefreshIcon, SchoolIcon } from './Icons';

const { WifiModule, TimerModule: _TestTimerModule } = NativeModules;

// Boot-elapsed cache for spoof-proof timestamps in test results
let _testBootCache = 0;
let _testBootCacheAt = 0;
async function _refreshTestBootCache() {
  try {
    if (_TestTimerModule && _TestTimerModule.getBootElapsedMs) {
      const { bootElapsedMs } = await _TestTimerModule.getBootElapsedMs();
      _testBootCache = bootElapsedMs;
      _testBootCacheAt = Date.now();
    }
  } catch (_) {}
}
function _testGetNow() {
  // 1. Server time (best)
  try { return getServerTime().nowDate(); } catch (_) {}
  // 2. Boot-elapsed
  if (_testBootCache > 0) {
    return new Date(_testBootCache + Math.max(0, Date.now() - _testBootCacheAt));
  }
  // 3. Device time fallback
  return new Date();
}
function _testTimestamp() {
  return _testGetNow().toLocaleTimeString();
}
function _testId() {
  if (_testBootCache > 0) return _testBootCache + Math.max(0, Date.now() - _testBootCacheAt);
  try { return getServerTime().now(); } catch (_) {}
  return Date.now();
}

export default function TestBSSID({ theme }) {
  // Existing Diagnostics state
  const [testResults, setTestResults] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [currentBSSID, setCurrentBSSID] = useState(null);
  const [wifiInfo, setWifiInfo] = useState(null);

  // New WiFi Radar specific state
  const [activePeriod, setActivePeriod] = useState(null);
  const [dailySchedule, setDailySchedule] = useState([]);
  const [radarStatus, setRadarStatus] = useState('searching'); // 'searching' | 'connected' | 'wrong_wifi' | 'offline'
  const [connectedSSID, setConnectedSSID] = useState(null);
  const [connectedRSSI, setConnectedRSSI] = useState(0);

  // Animation values for Radar scanner
  const pulseAnim = useRef(new Animated.Value(0)).current;

  // Initialize radar pulse loop
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 2500,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    ).start();
  }, [pulseAnim]);

  // Update Radar state by querying current period and connected WiFi details
  const updateRadarState = async () => {
    try {
      let bssidResult = null;
      if (WifiModule) {
        try {
          bssidResult = await WifiModule.getBSSID();
        } catch (e) {
          console.log('Radar check getBSSID error:', e.message);
        }
      }

      const period = await BSSIDStorage.getCurrentPeriodBSSID();
      const schedule = await BSSIDStorage.getFullSchedule();
      
      setActivePeriod(period);
      setDailySchedule(schedule || []);

      if (bssidResult && bssidResult.success && bssidResult.bssid) {
        const curBssid = bssidResult.bssid.toLowerCase().trim();
        setCurrentBSSID(curBssid);
        setConnectedSSID(bssidResult.ssid);
        setConnectedRSSI(bssidResult.rssi);
        setWifiInfo(bssidResult);

        // Verify if BSSID is expected
        if (period) {
          let authBSSIDs = [];
          if (period.bssids && Array.isArray(period.bssids)) {
            authBSSIDs = period.bssids.map(b => b.toLowerCase().trim());
          } else if (Array.isArray(period.bssid)) {
            authBSSIDs = period.bssid.map(b => b.toLowerCase().trim());
          } else if (period.bssid && typeof period.bssid === 'string') {
            authBSSIDs = [period.bssid.toLowerCase().trim()];
          }

          const isValid = authBSSIDs.includes(curBssid);
          setRadarStatus(isValid ? 'connected' : 'wrong_wifi');
        } else {
          // No active period, check today's schedule BSSIDs as general match
          let anyMatch = false;
          if (schedule && schedule.length > 0) {
            anyMatch = schedule.some(p => {
              let pBssids = [];
              if (p.bssids && Array.isArray(p.bssids)) {
                pBssids = p.bssids.map(b => b.toLowerCase().trim());
              } else if (Array.isArray(p.bssid)) {
                pBssids = p.bssid.map(b => b.toLowerCase().trim());
              } else if (p.bssid && typeof p.bssid === 'string') {
                pBssids = [p.bssid.toLowerCase().trim()];
              }
              return pBssids.includes(curBssid);
            });
          }
          setRadarStatus(anyMatch ? 'connected' : 'wrong_wifi');
        }
      } else {
        setCurrentBSSID(null);
        setConnectedSSID(null);
        setConnectedRSSI(0);
        setWifiInfo(null);
        setRadarStatus('offline');
      }
    } catch (error) {
      console.error('Error updating radar state:', error);
      setRadarStatus('offline');
    }
  };

  // Run Radar updates every 5 seconds
  useEffect(() => {
    updateRadarState();
    const intervalId = setInterval(updateRadarState, 5000);
    return () => clearInterval(intervalId);
  }, []);

  // Helper getters for Radar UI styling and texts
  const getStatusBadgeColor = (status) => {
    switch (status) {
      case 'connected': return '#10b981'; // Emerald
      case 'wrong_wifi': return '#f59e0b'; // Amber
      case 'offline': return '#ef4444'; // Red
      case 'searching':
      default: return '#3b82f6'; // Blue
    }
  };

  const getStatusText = (status) => {
    switch (status) {
      case 'connected': return 'VERIFIED IN-ZONE';
      case 'wrong_wifi': return 'UNAUTHORIZED NETWORK';
      case 'offline': return 'RADAR OFFLINE';
      case 'searching':
      default: return 'SCANNING RADAR...';
    }
  };

  const getRadarColor = (status) => {
    switch (status) {
      case 'connected': return '#10b981';
      case 'wrong_wifi': return '#f59e0b';
      case 'offline': return '#ef4444';
      case 'searching':
      default: return '#3b82f6';
    }
  };

  const getSignalStrengthWord = (rssi) => {
    if (!rssi) return 'Unknown';
    if (rssi >= -50) return 'Excellent';
    if (rssi >= -67) return 'Good';
    if (rssi >= -75) return 'Fair';
    return 'Weak';
  };

  const getRadarHelperMessage = (status) => {
    switch (status) {
      case 'connected':
        return 'You are connected to the expected classroom WiFi network. Attendance signaling is active and secure.';
      case 'wrong_wifi':
        return 'Device WiFi BSSID does not match expected classroom access point. Please connect to the correct classroom WiFi.';
      case 'offline':
        return 'Device WiFi is disabled or disconnected. Please enable WiFi and connect to your classroom access point.';
      case 'searching':
      default:
        return 'Scanning location and active WiFi signal details...';
    }
  };

  const getExpectedBssidsList = (period) => {
    if (!period) return [];
    if (period.bssids && Array.isArray(period.bssids)) {
      return period.bssids.filter(b => typeof b === 'string' && b.trim() !== '');
    }
    if (period.bssid) {
      if (Array.isArray(period.bssid)) {
        return period.bssid.filter(b => typeof b === 'string' && b.trim() !== '');
      }
      if (typeof period.bssid === 'string' && period.bssid.trim() !== '') {
        return [period.bssid];
      }
    }
    return [];
  };

  // Existing Logger helpers
  const addResult = (test, result, success = true) => {
    _refreshTestBootCache();
    const timestamp = _testTimestamp();
    setTestResults(prev => [...prev, {
      id: _testId(),
      test,
      result,
      success,
      timestamp
    }]);
  };

  const clearResults = () => {
    setTestResults([]);
  };

  // Existing Developer Functions (kept untouched)
  const runFullTest = async () => {
    setIsLoading(true);
    clearResults();
    
    try {
      addResult('Test Started', 'Running comprehensive BSSID detection test...');

      addResult('Native Module Check', WifiModule ? '✅ WifiModule found' : '❌ WifiModule not found', !!WifiModule);
      
      if (!WifiModule) {
        addResult('Error', 'Native WiFi module not available. Please rebuild the app.', false);
        setIsLoading(false);
        return;
      }

      try {
        const connectionTest = await WifiModule.testConnection();
        addResult('Connection Test', `✅ ${connectionTest.message}`, true);
      } catch (error) {
        addResult('Connection Test', `❌ ${error.message}`, false);
      }

      try {
        const permissions = await WifiModule.checkPermissions();
        addResult('Permission Check', `Fine Location: ${permissions.ACCESS_FINE_LOCATION ? '✅' : '❌'}, Coarse Location: ${permissions.ACCESS_COARSE_LOCATION ? '✅' : '❌'}`, permissions.ACCESS_FINE_LOCATION || permissions.ACCESS_COARSE_LOCATION);
        
        if (!permissions.ACCESS_FINE_LOCATION && !permissions.ACCESS_COARSE_LOCATION) {
          addResult('Requesting Permissions', 'Location permission required for BSSID detection...');
          
          const granted = await PermissionsAndroid.requestMultiple([
            PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
            PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION,
          ]);
          
          const fineGranted = granted[PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION] === PermissionsAndroid.RESULTS.GRANTED;
          const coarseGranted = granted[PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION] === PermissionsAndroid.RESULTS.GRANTED;
          
          addResult('Permission Request', `Fine: ${fineGranted ? '✅' : '❌'}, Coarse: ${coarseGranted ? '✅' : '❌'}`, fineGranted || coarseGranted);
        }
      } catch (error) {
        addResult('Permission Check', `❌ ${error.message}`, false);
      }

      try {
        const wifiState = await WifiModule.getWifiState();
        addResult('WiFi State', `WiFi Enabled: ${wifiState.isWifiEnabled ? '✅' : '❌'}, Connected: ${wifiState.isConnectedToWifi ? '✅' : '❌'}`, wifiState.isWifiEnabled);
        
        if (!wifiState.isWifiEnabled) {
          addResult('WiFi Disabled', 'Please enable WiFi and try again', false);
          setIsLoading(false);
          return;
        }
      } catch (error) {
        addResult('WiFi State', `❌ ${error.message}`, false);
      }

      try {
        const bssidResult = await WifiModule.getBSSID();
        if (bssidResult.success) {
          addResult('BSSID Detection', `✅ ${bssidResult.bssid}`, true);
          addResult('WiFi Details', `SSID: ${bssidResult.ssid}, Signal: ${bssidResult.rssi} dBm, Speed: ${bssidResult.linkSpeed} Mbps`);
        } else {
          addResult('BSSID Detection', `❌ Failed to get BSSID`, false);
        }
      } catch (error) {
        addResult('BSSID Detection', `❌ ${error.code}: ${error.message}`, false);
        
        if (error.code === 'PERMISSION_DENIED') {
          addResult('Solution', '💡 Grant location permission in Android settings');
        } else if (error.code === 'WIFI_DISABLED') {
          addResult('Solution', '💡 Enable WiFi on your device');
        } else if (error.code === 'NO_BSSID') {
          addResult('Solution', '💡 Connect to a WiFi network');
        }
      }

      try {
        addResult('WiFiManager Test', 'Testing WiFiManager integration...');
        await WiFiManager.initialize();
        const managerBSSID = await WiFiManager.getCurrentBSSID();
        addResult('WiFiManager BSSID', managerBSSID ? `✅ ${managerBSSID}` : '❌ No BSSID from WiFiManager', !!managerBSSID);
      } catch (error) {
        addResult('WiFiManager Test', `❌ ${error.message}`, false);
      }

      addResult('Test Complete', '🎉 All tests completed!');
      updateRadarState();

    } catch (error) {
      addResult('Test Error', `❌ ${error.message}`, false);
    }
    
    setIsLoading(false);
  };

  const testDirectBSSID = async () => {
    setIsLoading(true);
    try {
      if (!WifiModule) {
        Alert.alert('Error', 'Native WiFi module not available');
        return;
      }
      const result = await WifiModule.getBSSID();
      Alert.alert(
        'BSSID Test Result',
        `BSSID: ${result.bssid || 'Not detected'}\nSSID: ${result.ssid || 'Unknown'}\nSignal: ${result.rssi || 0} dBm`,
        [{ text: 'OK' }]
      );
      updateRadarState();
    } catch (error) {
      Alert.alert('BSSID Test Failed', `${error.code}: ${error.message}`);
    }
    setIsLoading(false);
  };

  const checkOfflineSchedule = async () => {
    setIsLoading(true);
    clearResults();
    
    try {
      addResult('Offline Schedule Check', 'Checking cached BSSID schedule...');
      const info = await BSSIDStorage.getScheduleInfo();
      
      addResult('Cache Status', `Has Schedule: ${info.hasSchedule ? '✅' : '❌'}`, info.hasSchedule);
      addResult('Schedule Date', `Saved: ${info.savedDate}, Is Today: ${info.isToday ? '✅' : '❌'}`, info.isToday);
      addResult('Period Count', `${info.periodCount} periods cached`);
      addResult('Cached At', info.cachedAt);
      addResult('Needs Refresh', info.needsRefresh ? '⚠️ Yes' : '✅ No', !info.needsRefresh);

      if (info.hasSchedule) {
        const schedule = await BSSIDStorage.getFullSchedule();
        addResult('Full Schedule', `Found ${schedule.length} periods:`);
        
        schedule.forEach((period, index) => {
          let bssidDisplay = 'Not configured';
          if (period.bssids && Array.isArray(period.bssids) && period.bssids.length > 0) {
            bssidDisplay = period.bssids.join(', ');
          } else if (Array.isArray(period.bssid) && period.bssid.length > 0) {
            bssidDisplay = period.bssid.join(', ');
          } else if (period.bssid && typeof period.bssid === 'string') {
            bssidDisplay = period.bssid;
          }
          
          addResult(
            `Period ${period.period || index + 1}`,
            `${period.subject || 'No subject'}\n` +
            `Time: ${period.startTime} - ${period.endTime}\n` +
            `Room: ${period.room || 'No room'}\n` +
            `BSSID: ${bssidDisplay}\n` +
            `Teacher: ${period.teacher || 'N/A'}`
          );
        });

        const currentPeriod = await BSSIDStorage.getCurrentPeriodBSSID();
        if (currentPeriod) {
          addResult('Current Period', `✅ Active class found!`, true);
          let bssidDisplay = 'Not configured';
          if (currentPeriod.bssids && Array.isArray(currentPeriod.bssids) && currentPeriod.bssids.length > 0) {
            bssidDisplay = currentPeriod.bssids.join(', ');
          } else if (Array.isArray(currentPeriod.bssid) && currentPeriod.bssid.length > 0) {
            bssidDisplay = currentPeriod.bssid.join(', ');
          } else if (currentPeriod.bssid && typeof currentPeriod.bssid === 'string') {
            bssidDisplay = currentPeriod.bssid;
          }
          
          addResult(
            'Current Class Details',
            `Subject: ${currentPeriod.subject}\n` +
            `Room: ${currentPeriod.room}\n` +
            `Time: ${currentPeriod.startTime} - ${currentPeriod.endTime}\n` +
            `BSSID: ${bssidDisplay}`
          );

          try {
            const deviceBSSID = await WiFiManager.getCurrentBSSID();
            if (deviceBSSID) {
              const validation = await BSSIDStorage.validateCurrentBSSID(deviceBSSID);
              let expectedDisplay = 'N/A';
              if (Array.isArray(validation.expected)) {
                expectedDisplay = validation.expected.join(', ');
              } else if (validation.expected) {
                expectedDisplay = validation.expected;
              }
              
              addResult(
                'BSSID Validation',
                `Status: ${validation.valid ? '✅ AUTHORIZED' : '❌ NOT AUTHORIZED'}\n` +
                `Reason: ${validation.reason}\n` +
                `Message: ${validation.message}\n` +
                `Expected: ${expectedDisplay}\n` +
                `Current: ${validation.current || 'N/A'}`,
                validation.valid
              );
            } else {
              addResult('BSSID Validation', '⚠️ No WiFi BSSID detected on device', false);
            }
          } catch (error) {
            addResult('BSSID Validation', `❌ Error: ${error.message}`, false);
          }
        } else {
          addResult('Current Period', '⚠️ No active class at this time', false);
        }
      } else {
        addResult('No Schedule', '❌ No offline schedule cached', false);
      }
      addResult('Check Complete', '🎉 Offline schedule check completed!');
      updateRadarState();
    } catch (error) {
      addResult('Check Error', `❌ ${error.message}`, false);
    }
    setIsLoading(false);
  };

  const refreshScheduleFromServer = async () => {
    setIsLoading(true);
    clearResults();
    
    try {
      addResult('Manual Refresh', 'Fetching fresh schedule from server...');
      const AsyncStorage = require('@react-native-async-storage/async-storage').default;
      const userData = await AsyncStorage.getItem('@user_data');
      
      if (!userData) {
        addResult('Error', '❌ No user data found. Please login first.', false);
        setIsLoading(false);
        return;
      }

      const user = JSON.parse(userData);
      const enrollmentNo = user.enrollmentNo;

      if (!enrollmentNo) {
        addResult('Error', '❌ No enrollment number found', false);
        setIsLoading(false);
        return;
      }

      addResult('User Info', `Enrollment: ${enrollmentNo}`);

      const response = await fetch(
        `${GET_DAILY_BSSID_SCHEDULE}?enrollmentNo=${encodeURIComponent(enrollmentNo)}`
      );
      const data = await response.json();

      if (data.success && data.schedule) {
        addResult('Server Response', `✅ Received ${data.schedule.length} periods for ${data.dayName}`, true);
        const saved = await BSSIDStorage.saveDailySchedule(data.schedule);

        if (saved) {
          addResult('Cache Updated', `✅ Successfully cached ${data.schedule.length} periods`, true);
          data.schedule.forEach((period, index) => {
            let bssidDisplay = 'Not configured';
            if (period.bssids && Array.isArray(period.bssids) && period.bssids.length > 0) {
              bssidDisplay = period.bssids.join(', ');
            } else if (Array.isArray(period.bssid) && period.bssid.length > 0) {
              bssidDisplay = period.bssid.join(', ');
            } else if (period.bssid && typeof period.bssid === 'string') {
              bssidDisplay = period.bssid;
            }
            
            addResult(
              `Period ${period.period || index + 1}`,
              `${period.subject || 'No subject'}\n` +
              `Time: ${period.startTime} - ${period.endTime}\n` +
              `Room: ${period.room || 'No room'}\n` +
              `BSSID: ${bssidDisplay}`
            );
          });
          addResult('Success', '🎉 Schedule refreshed! Go back to Home to check in.', true);
        } else {
          addResult('Cache Error', '❌ Failed to save schedule to cache', false);
        }
      } else {
        addResult('Server Error', `❌ ${data.message || 'Failed to fetch schedule'}`, false);
      }
      updateRadarState();
    } catch (error) {
      addResult('Refresh Error', `❌ ${error.message}`, false);
    }
    setIsLoading(false);
  };

  return (
    <ScrollView style={[styles.container, { backgroundColor: theme.background }]} contentContainerStyle={{ paddingBottom: 110 }}>
      <Text style={[styles.title, { color: theme.text }]}>WiFi Diagnostics & Radar</Text>
      
      {/* ── NEW STYLISH AUTHORIZED WIFI RADAR SECTION ── */}
      <View style={[styles.radarCard, { backgroundColor: theme.cardBackground, borderColor: theme.border }]}>
        <View style={styles.radarHeader}>
          <Text style={[styles.radarTitle, { color: theme.text }]}>📡 WiFi Radar Status</Text>
          <View style={[styles.badge, { backgroundColor: getStatusBadgeColor(radarStatus) }]}>
            <Text style={styles.badgeText}>{getStatusText(radarStatus)}</Text>
          </View>
        </View>

        <View style={styles.radarContentContainer}>
          {/* Radar sweeping/pulsing circles visual */}
          <View style={styles.radarVisualContainer}>
            <View style={[styles.radarOuterCircle, { borderColor: theme.border }]}>
              <View style={[styles.radarMiddleCircle, { borderColor: theme.border }]}>
                <View style={[styles.radarInnerCircle, { borderColor: theme.border }]}>
                  {/* Outer pulsating wave */}
                  <Animated.View style={[
                    styles.radarPulse,
                    {
                      transform: [{ scale: pulseAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 2.4] }) }],
                      opacity: pulseAnim.interpolate({ inputRange: [0, 1], outputRange: [0.6, 0] }),
                      borderColor: getRadarColor(radarStatus),
                    }
                  ]} />
                  {/* Inner pulsating wave */}
                  <Animated.View style={[
                    styles.radarPulse,
                    {
                      transform: [{ scale: pulseAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 1.7] }) }],
                      opacity: pulseAnim.interpolate({ inputRange: [0, 0.8, 1], outputRange: [0.5, 0.4, 0] }),
                      borderColor: getRadarColor(radarStatus),
                    }
                  ]} />
                  {/* Center core indicator */}
                  <View style={[styles.radarCore, { backgroundColor: getRadarColor(radarStatus) }]} />
                </View>
              </View>
            </View>
          </View>

          {/* Connected Network Status Details */}
          <View style={styles.radarInfoContainer}>
            <Text style={[styles.infoLabel, { color: theme.textSecondary }]}>Connected SSID</Text>
            <Text style={[styles.infoValue, { color: theme.text }]} numberOfLines={1}>
              {connectedSSID || 'Not Connected'}
            </Text>
            
            <Text style={[styles.infoLabel, { color: theme.textSecondary }]}>WiFi BSSID (MAC)</Text>
            <Text style={[styles.infoValueCode, { color: theme.text }]} numberOfLines={1}>
              {currentBSSID || 'Not Available'}
            </Text>

            {currentBSSID && (
              <View style={styles.signalContainer}>
                <Text style={[styles.infoLabel, { color: theme.textSecondary }]}>Signal: </Text>
                <Text style={[styles.signalValue, { color: getRadarColor(radarStatus) }]}>
                  {connectedRSSI} dBm ({getSignalStrengthWord(connectedRSSI)})
                </Text>
              </View>
            )}
          </View>
        </View>

        <Text style={[styles.radarHelperText, { color: theme.textSecondary }]}>
          {getRadarHelperMessage(radarStatus)}
        </Text>
      </View>

      {/* ── CURRENT PERIOD TIMETABLE & AUTHORIZED BSSIDS ── */}
      <View style={[styles.detailsCard, { backgroundColor: theme.cardBackground, borderColor: theme.border }]}>
        <Text style={[styles.cardHeaderTitle, { color: theme.text }]}>⏰ Current Period Classroom WiFi</Text>
        {activePeriod ? (
          <View style={styles.periodDetailBox}>
            <View style={styles.periodRow}>
              <Text style={[styles.periodSubject, { color: theme.text }]} numberOfLines={1}>
                {activePeriod.subject}
              </Text>
              <View style={styles.roomBadge}>
                <Text style={styles.roomBadgeText}>{activePeriod.room}</Text>
              </View>
            </View>
            <Text style={[styles.periodTime, { color: theme.textSecondary }]}>
              🕒 {activePeriod.startTime} - {activePeriod.endTime}
            </Text>
            
            <View style={[styles.expectedBssidsContainer, { borderTopColor: theme.border }]}>
              <Text style={[styles.expectedTitle, { color: theme.textSecondary }]}>Expected Class BSSID(s):</Text>
              {getExpectedBssidsList(activePeriod).map((bssid, idx) => {
                const isMatched = currentBSSID && currentBSSID.toLowerCase().trim() === bssid.toLowerCase().trim();
                return (
                  <View key={idx} style={styles.bssidListItem}>
                    <Text style={[styles.bssidText, { color: isMatched ? '#10b981' : theme.text }]}>
                      {bssid}
                    </Text>
                    {isMatched ? (
                      <Text style={styles.matchBadge}>🎯 MATCHED</Text>
                    ) : (
                      <Text style={[styles.noMatchBadge, { color: theme.textSecondary }]}>OFFLINE</Text>
                    )}
                  </View>
                );
              })}
            </View>
          </View>
        ) : (
          <View style={styles.emptyContainer}>
            <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
              No active class period scheduled right now.
            </Text>
          </View>
        )}
      </View>

      {/* ── TODAY'S SCHEDULED AUTHORIZED WIFI LIST ── */}
      <View style={[styles.detailsCard, { backgroundColor: theme.cardBackground, borderColor: theme.border }]}>
        <Text style={[styles.cardHeaderTitle, { color: theme.text }]}>📋 Today's Expected WiFi Radar</Text>
        {dailySchedule && dailySchedule.length > 0 ? (
          <View style={styles.scheduleList}>
            {dailySchedule.map((period, idx) => {
              const bssids = getExpectedBssidsList(period);
              const isAnyMatched = bssids.some(b => currentBSSID && currentBSSID.toLowerCase().trim() === b.toLowerCase().trim());
              const isCurrent = activePeriod && activePeriod.startTime === period.startTime;

              return (
                <View 
                  key={idx} 
                  style={[
                    styles.scheduleItem, 
                    { borderBottomColor: theme.border },
                    isCurrent && { backgroundColor: theme.statusBar === 'dark' ? 'rgba(0,0,0,0.03)' : 'rgba(255,255,255,0.08)' }
                  ]}
                >
                  <View style={styles.scheduleLeft}>
                    <Text style={[styles.scheduleSubject, { color: theme.text }]} numberOfLines={1}>
                      {period.subject}
                    </Text>
                    <Text style={[styles.scheduleTime, { color: theme.textSecondary }]}>
                      {period.startTime} - {period.endTime} ({period.room})
                    </Text>
                  </View>
                  <View style={styles.scheduleRight}>
                    {isAnyMatched ? (
                      <View style={styles.greenStatusDot} />
                    ) : (
                      <View style={[styles.greyStatusDot, { backgroundColor: theme.textSecondary + '33' }]} />
                    )}
                    <Text style={[
                      styles.scheduleStatusText, 
                      { color: isAnyMatched ? '#10b981' : theme.textSecondary }
                    ]}>
                      {isAnyMatched ? 'IN RANGE' : 'OUT RANGE'}
                    </Text>
                  </View>
                </View>
              );
            })}
          </View>
        ) : (
          <View style={styles.emptyContainer}>
            <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
              No cached daily schedule. Refresh from server to sync.
            </Text>
          </View>
        )}
      </View>

      {/* ── DIAGNOSTICS & LOGS (UNTOUCHED) ── */}
      <Text style={[styles.sectionTitle, { color: theme.text }]}>Developer Diagnostics</Text>
      
      <View style={styles.buttonContainer}>
        <TouchableOpacity 
          style={[styles.button, { backgroundColor: theme.primary }]}
          onPress={runFullTest}
          disabled={isLoading}
        >
          <Text style={styles.buttonText}>
            {isLoading ? '🔄 Testing...' : '🧪 Run Full Test'}
          </Text>
        </TouchableOpacity>
        
        <TouchableOpacity 
          style={[styles.button, { backgroundColor: '#6b7280' }]}
          onPress={testDirectBSSID}
          disabled={isLoading}
        >
          <Text style={styles.buttonText}>📶 Quick BSSID Test</Text>
        </TouchableOpacity>
        
        <TouchableOpacity 
          style={[styles.button, { backgroundColor: '#8b5cf6' }]}
          onPress={checkOfflineSchedule}
          disabled={isLoading}
        >
          <Text style={styles.buttonText}>📅 Check Offline Schedule</Text>
        </TouchableOpacity>
        
        <TouchableOpacity 
          style={[styles.button, { backgroundColor: '#10b981' }]}
          onPress={refreshScheduleFromServer}
          disabled={isLoading}
        >
          <Text style={styles.buttonText}>🔄 Refresh from Server</Text>
        </TouchableOpacity>
        
        <TouchableOpacity 
          style={[styles.button, { backgroundColor: '#ef4444' }]}
          onPress={clearResults}
        >
          <Text style={styles.buttonText}>🗑️ Clear Results</Text>
        </TouchableOpacity>
      </View>

      <View style={[styles.logWrapper, { backgroundColor: theme.cardBackground }]}>
        <ScrollView style={styles.resultsContainer} nestedScrollEnabled={true}>
          {testResults.map((result) => (
            <View key={result.id} style={[styles.resultItem, { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.border }]}>
              <View style={styles.resultHeader}>
                <Text style={[styles.resultTest, { color: theme.text }]}>{result.test}</Text>
                <Text style={[styles.resultTime, { color: theme.textSecondary }]}>{result.timestamp}</Text>
              </View>
              <Text style={[styles.resultText, { color: result.success ? '#10b981' : '#ef4444' }]}>
                {result.result}
              </Text>
            </View>
          ))}
          {testResults.length === 0 && (
            <View style={styles.emptyContainer}>
              <Text style={[styles.emptyText, { color: theme.textSecondary, marginTop: 40 }]}>
                Run diagnostic tests to view logs here.
              </Text>
            </View>
          )}
        </ScrollView>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    textAlign: 'center',
    marginTop: 15,
    marginBottom: 15,
    letterSpacing: 0.5,
  },
  radarCard: {
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    marginHorizontal: 15,
    marginBottom: 15,
    elevation: 2,
  },
  radarHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  radarTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  badgeText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: 'bold',
  },
  radarContentContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  radarVisualContainer: {
    width: 100,
    height: 100,
    justifyContent: 'center',
    alignItems: 'center',
  },
  radarOuterCircle: {
    width: 90,
    height: 90,
    borderRadius: 45,
    borderWidth: 1,
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
  },
  radarMiddleCircle: {
    width: 66,
    height: 66,
    borderRadius: 33,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  radarInnerCircle: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  radarPulse: {
    position: 'absolute',
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1.5,
  },
  radarCore: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  radarInfoContainer: {
    flex: 1,
    marginLeft: 16,
    justifyContent: 'center',
  },
  infoLabel: {
    fontSize: 11,
    fontWeight: '500',
    marginBottom: 2,
  },
  infoValue: {
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 8,
  },
  infoValueCode: {
    fontSize: 13,
    fontFamily: 'monospace',
    fontWeight: '600',
    marginBottom: 8,
  },
  signalContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  signalValue: {
    fontSize: 12,
    fontWeight: '700',
  },
  radarHelperText: {
    fontSize: 12,
    lineHeight: 16,
    textAlign: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(0,0,0,0.1)',
    paddingTop: 10,
    marginTop: 4,
  },
  detailsCard: {
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    marginHorizontal: 15,
    marginBottom: 15,
  },
  cardHeaderTitle: {
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 12,
  },
  periodDetailBox: {
    marginTop: 2,
  },
  periodRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  periodSubject: {
    fontSize: 16,
    fontWeight: '700',
    flex: 1,
  },
  roomBadge: {
    backgroundColor: '#8b5cf6',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  roomBadgeText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '700',
  },
  periodTime: {
    fontSize: 13,
    marginBottom: 12,
  },
  expectedBssidsContainer: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 12,
  },
  expectedTitle: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 6,
  },
  bssidListItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
  },
  bssidText: {
    fontSize: 13,
    fontFamily: 'monospace',
    fontWeight: '600',
  },
  matchBadge: {
    color: '#10b981',
    fontSize: 10,
    fontWeight: 'bold',
    backgroundColor: 'rgba(16,185,129,0.1)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  noMatchBadge: {
    fontSize: 10,
    fontWeight: 'bold',
    backgroundColor: 'rgba(0,0,0,0.05)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  emptyContainer: {
    paddingVertical: 10,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 13,
    fontStyle: 'italic',
    textAlign: 'center',
  },
  scheduleList: {
    marginTop: 2,
  },
  scheduleItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  scheduleLeft: {
    flex: 1,
  },
  scheduleSubject: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 2,
  },
  scheduleTime: {
    fontSize: 12,
  },
  scheduleRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  greenStatusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#10b981',
    marginRight: 6,
  },
  greyStatusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  scheduleStatusText: {
    fontSize: 11,
    fontWeight: '700',
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    marginHorizontal: 15,
    marginTop: 10,
    marginBottom: 10,
  },
  buttonContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginHorizontal: 15,
    marginBottom: 15,
  },
  button: {
    flex: 1,
    minWidth: 100,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 4,
  },
  buttonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  logWrapper: {
    height: 200,
    marginHorizontal: 15,
    marginBottom: 30,
    borderRadius: 12,
    overflow: 'hidden',
  },
  resultsContainer: {
    flex: 1,
    padding: 10,
  },
  resultItem: {
    padding: 10,
    marginBottom: 6,
  },
  resultHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 2,
  },
  resultTest: {
    fontSize: 12,
    fontWeight: '600',
  },
  resultTime: {
    fontSize: 10,
  },
  resultText: {
    fontSize: 11,
    fontFamily: 'monospace',
  },
});