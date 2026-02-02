import React, { useState, useEffect } from 'react';
import { Camera, Smartphone, Video, Monitor, Trash2, Star, Settings, Plus, Wifi, WifiOff, AlertCircle, QrCode } from 'lucide-react';
import { livestreamStorage } from '../../utils/livestreamStorage';
import type { LivestreamCamera, CameraType, CameraStatus } from '../../types/livestream';
import { MobileCameraQRModal } from './MobileCameraQRModal';

interface CameraManagerProps {
  sessionId: string;
  onCameraSwitch?: (camera: LivestreamCamera) => void;
}

export function CameraManager({ sessionId, onCameraSwitch }: CameraManagerProps) {
  const [cameras, setCameras] = useState<LivestreamCamera[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCamera, setSelectedCamera] = useState<LivestreamCamera | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showQRModal, setShowQRModal] = useState(false);
  const [newCamera, setNewCamera] = useState({
    camera_name: 'Laptop Camera',
    camera_type: 'laptop' as CameraType,
    is_primary: false
  });

  useEffect(() => {
    loadCameras();

    const subscription = livestreamStorage.subscribeToSessionCameras(sessionId, (updatedCameras) => {
      setCameras(updatedCameras);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [sessionId]);

  const loadCameras = async () => {
    try {
      setLoading(true);
      const data = await livestreamStorage.getCameras(sessionId);
      setCameras(data);
    } catch (error) {
      console.error('Error loading cameras:', error);
    } finally {
      setLoading(false);
    }
  };

  const requestCameraAccess = async (cameraType: CameraType) => {
    // For laptop and mobile cameras, request browser camera access
    if (cameraType === 'laptop' || cameraType === 'mobile') {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: false
        });

        // Get the device information
        const tracks = stream.getVideoTracks();
        if (tracks.length > 0) {
          const deviceLabel = tracks[0].label;

          // Stop the stream after getting the device info
          stream.getTracks().forEach(track => track.stop());

          return deviceLabel;
        }

        // Stop the stream if no tracks
        stream.getTracks().forEach(track => track.stop());
      } catch (error) {
        console.error('Error accessing camera:', error);
        alert('Camera access denied. Please allow camera access in your browser settings.');
        throw error;
      }
    }
    return null;
  };

  const handleAddCamera = async () => {
    if (!newCamera.camera_name.trim()) {
      alert('Please enter a camera name');
      return;
    }

    try {
      // Request camera access for laptop/mobile cameras
      let deviceName = null;
      if (newCamera.camera_type === 'laptop' || newCamera.camera_type === 'mobile') {
        deviceName = await requestCameraAccess(newCamera.camera_type);
      }

      await livestreamStorage.createCamera({
        livestream_session_id: sessionId,
        camera_name: newCamera.camera_name,
        camera_type: newCamera.camera_type,
        is_primary: newCamera.is_primary,
        status: deviceName ? 'connected' : 'disconnected',
        position: cameras.length,
        device_info: deviceName ? { deviceName } : undefined
      });

      setShowAddModal(false);
      setNewCamera({
        camera_name: 'Laptop Camera',
        camera_type: 'laptop',
        is_primary: false
      });
    } catch (error) {
      console.error('Error adding camera:', error);
      // Don't show alert if it was a camera access error (already shown)
      if (error instanceof Error && !error.message.includes('denied')) {
        alert('Failed to add camera');
      }
    }
  };

  const handleSetPrimary = async (cameraId: string) => {
    try {
      await livestreamStorage.setPrimaryCamera(sessionId, cameraId);

      const camera = cameras.find(c => c.id === cameraId);
      if (camera && onCameraSwitch) {
        onCameraSwitch(camera);
      }
    } catch (error) {
      console.error('Error setting primary camera:', error);
    }
  };

  const handleDeleteCamera = async (cameraId: string) => {
    if (!confirm('Are you sure you want to remove this camera?')) return;

    try {
      await livestreamStorage.deleteCamera(cameraId);
    } catch (error) {
      console.error('Error deleting camera:', error);
    }
  };

  const getCameraIcon = (type: CameraType) => {
    switch (type) {
      case 'mobile':
        return <Smartphone className="w-5 h-5" />;
      case 'laptop':
        return <Monitor className="w-5 h-5" />;
      case 'action':
        return <Camera className="w-5 h-5" />;
      case 'external':
        return <Video className="w-5 h-5" />;
      default:
        return <Camera className="w-5 h-5" />;
    }
  };

  const getStatusIcon = (status: CameraStatus) => {
    switch (status) {
      case 'connected':
        return <Wifi className="w-4 h-4 text-green-500" />;
      case 'streaming':
        return <Video className="w-4 h-4 text-red-500 animate-pulse" />;
      case 'disconnected':
        return <WifiOff className="w-4 h-4 text-gray-500" />;
      case 'error':
        return <AlertCircle className="w-4 h-4 text-red-500" />;
    }
  };

  const getStatusColor = (status: CameraStatus) => {
    switch (status) {
      case 'connected':
        return 'text-green-500';
      case 'streaming':
        return 'text-red-500';
      case 'disconnected':
        return 'text-gray-500';
      case 'error':
        return 'text-red-500';
    }
  };

  const getCameraTypeLabel = (type: CameraType) => {
    switch (type) {
      case 'mobile':
        return 'Phone Camera';
      case 'laptop':
        return 'Laptop Camera';
      case 'action':
        return 'Action Camera';
      case 'external':
        return 'External Camera';
      default:
        return type;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-gray-400">Loading cameras...</div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-white">Camera Sources</h3>
          <p className="text-sm text-gray-400 mt-1">
            Manage multiple cameras for your livestream
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowQRModal(true)}
            className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium flex items-center gap-2 transition-colors"
          >
            <QrCode className="w-4 h-4" />
            Connect Phone
          </button>
          <button
            onClick={() => setShowAddModal(true)}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium flex items-center gap-2 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add Camera
          </button>
        </div>
      </div>

      {/* Camera Grid */}
      {cameras.length === 0 ? (
        <div className="bg-slate-700/50 border border-slate-600 rounded-xl p-8 text-center">
          <Camera className="w-12 h-12 text-gray-400 mx-auto mb-3" />
          <p className="text-gray-400 mb-4">No cameras connected</p>
          <p className="text-sm text-gray-500 mb-6">
            Add cameras to start multi-camera streaming
          </p>
          <div className="flex gap-3 justify-center">
            <button
              onClick={() => setShowQRModal(true)}
              className="px-6 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium inline-flex items-center gap-2 transition-colors"
            >
              <Smartphone className="w-4 h-4" />
              Connect Phone Camera
            </button>
            <button
              onClick={() => setShowAddModal(true)}
              className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium inline-flex items-center gap-2 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Add Other Camera
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {cameras.map((camera) => (
            <div
              key={camera.id}
              className={`bg-slate-700/50 border ${
                camera.is_primary ? 'border-blue-500 ring-2 ring-blue-500/20' : 'border-slate-600'
              } rounded-xl p-4 hover:border-slate-500 transition-all`}
            >
              {/* Camera Header */}
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-lg ${
                    camera.is_primary ? 'bg-blue-600' : 'bg-slate-600'
                  }`}>
                    {getCameraIcon(camera.camera_type)}
                  </div>
                  <div>
                    <h4 className="font-semibold text-white flex items-center gap-2">
                      {camera.camera_name}
                      {camera.is_primary && (
                        <Star className="w-4 h-4 text-yellow-500 fill-yellow-500" />
                      )}
                    </h4>
                    <p className="text-sm text-gray-400">
                      {getCameraTypeLabel(camera.camera_type)}
                    </p>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      setSelectedCamera(camera);
                      setShowSettings(true);
                    }}
                    className="p-2 hover:bg-slate-600 rounded-lg transition-colors"
                    title="Settings"
                  >
                    <Settings className="w-4 h-4 text-gray-400" />
                  </button>
                  <button
                    onClick={() => handleDeleteCamera(camera.id)}
                    className="p-2 hover:bg-red-500/20 rounded-lg transition-colors"
                    title="Remove"
                  >
                    <Trash2 className="w-4 h-4 text-red-400" />
                  </button>
                </div>
              </div>

              {/* Status */}
              <div className="flex items-center justify-between text-sm mb-3">
                <div className="flex items-center gap-2">
                  {getStatusIcon(camera.status)}
                  <span className={getStatusColor(camera.status)}>
                    {camera.status.charAt(0).toUpperCase() + camera.status.slice(1)}
                  </span>
                </div>
                {camera.quality_settings?.resolution && (
                  <span className="text-gray-400">
                    {camera.quality_settings.resolution} @ {camera.quality_settings.fps || 30}fps
                  </span>
                )}
              </div>

              {/* Device Info */}
              {camera.device_info?.deviceName && (
                <div className="text-sm text-gray-400 mb-3">
                  <span className="font-medium">Device:</span> {camera.device_info.deviceName}
                </div>
              )}

              {/* Last Connected */}
              {camera.last_connected_at && (
                <div className="text-xs text-gray-500 mb-3">
                  Last connected: {new Date(camera.last_connected_at).toLocaleString()}
                </div>
              )}

              {/* Set Primary Button */}
              {!camera.is_primary && camera.status === 'connected' && (
                <button
                  onClick={() => handleSetPrimary(camera.id)}
                  className="w-full px-4 py-2 bg-slate-600 hover:bg-blue-600 text-white rounded-lg text-sm font-medium transition-colors"
                >
                  Set as Primary
                </button>
              )}

              {camera.is_primary && (
                <div className="px-4 py-2 bg-blue-600/20 border border-blue-500/30 text-blue-300 rounded-lg text-sm font-medium text-center">
                  Primary Camera
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Add Camera Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 border border-slate-700 rounded-xl w-full max-w-md">
            <div className="flex items-center justify-between p-6 border-b border-slate-700">
              <h3 className="text-lg font-semibold text-white">Add Camera Source</h3>
              <button
                onClick={() => {
                  setShowAddModal(false);
                  setNewCamera({
                    camera_name: 'Laptop Camera',
                    camera_type: 'laptop',
                    is_primary: false
                  });
                }}
                className="text-gray-400 hover:text-white text-2xl"
              >
                ×
              </button>
            </div>

            <div className="p-6 space-y-4">
              {/* Camera Name */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Camera Name
                </label>
                <input
                  type="text"
                  value={newCamera.camera_name}
                  onChange={(e) => setNewCamera({ ...newCamera, camera_name: e.target.value })}
                  placeholder="e.g., Finish Line, Commentary Cam"
                  className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Camera Type */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Camera Type
                </label>
                <select
                  value={newCamera.camera_type}
                  onChange={(e) => {
                    const type = e.target.value as CameraType;
                    // Auto-populate camera name based on type if name is one of the defaults
                    const isDefaultName = newCamera.camera_name === '' ||
                      newCamera.camera_name === 'Laptop Camera' ||
                      newCamera.camera_name === 'Phone Camera' ||
                      newCamera.camera_name === 'Action Camera' ||
                      newCamera.camera_name === 'External Camera' ||
                      newCamera.camera_name === 'Mobile Phone';

                    setNewCamera({
                      ...newCamera,
                      camera_type: type,
                      camera_name: isDefaultName ? getCameraTypeLabel(type) : newCamera.camera_name
                    });
                  }}
                  className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="laptop">Laptop Camera</option>
                  <option value="mobile">Mobile Phone</option>
                  <option value="action">Action Camera (GoPro/Insta360)</option>
                  <option value="external">External Camera/RTMP</option>
                </select>
              </div>

              {/* Set as Primary */}
              <div className="flex items-center justify-between p-4 bg-slate-700/50 rounded-lg">
                <label className="text-sm font-medium text-gray-300">
                  Set as primary camera
                </label>
                <input
                  type="checkbox"
                  checked={newCamera.is_primary}
                  onChange={(e) => setNewCamera({ ...newCamera, is_primary: e.target.checked })}
                  className="w-5 h-5 rounded"
                />
              </div>

              {/* Info Box */}
              <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-3">
                <p className="text-sm text-blue-200/80">
                  {newCamera.camera_type === 'mobile' && 'When you click Add Camera, your browser will prompt you to select which camera to use.'}
                  {newCamera.camera_type === 'laptop' && 'When you click Add Camera, your browser will prompt you to select which camera to use for streaming.'}
                  {newCamera.camera_type === 'action' && 'Connect via RTMP or app integration for GoPro/Insta360 cameras.'}
                  {newCamera.camera_type === 'external' && 'Configure RTMP settings or external camera connection.'}
                </p>
              </div>
            </div>

            <div className="flex gap-3 p-6 border-t border-slate-700">
              <button
                onClick={() => {
                  setShowAddModal(false);
                  setNewCamera({
                    camera_name: 'Laptop Camera',
                    camera_type: 'laptop',
                    is_primary: false
                  });
                }}
                className="flex-1 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleAddCamera}
                className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
              >
                Add Camera
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Camera Settings Modal */}
      {showSettings && selectedCamera && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 border border-slate-700 rounded-xl w-full max-w-md">
            <div className="flex items-center justify-between p-6 border-b border-slate-700">
              <h3 className="text-lg font-semibold text-white">Camera Settings</h3>
              <button
                onClick={() => {
                  setShowSettings(false);
                  setSelectedCamera(null);
                }}
                className="text-gray-400 hover:text-white text-2xl"
              >
                ×
              </button>
            </div>

            <div className="p-6 space-y-4">
              {/* Camera Name */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Camera Name
                </label>
                <input
                  type="text"
                  value={selectedCamera.camera_name}
                  onChange={(e) => {
                    livestreamStorage.updateCamera(selectedCamera.id, {
                      camera_name: e.target.value
                    });
                  }}
                  className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Quality Settings */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Video Quality
                </label>
                <select
                  value={selectedCamera.quality_settings?.resolution || '1920x1080'}
                  onChange={(e) => {
                    livestreamStorage.updateCamera(selectedCamera.id, {
                      quality_settings: {
                        ...selectedCamera.quality_settings,
                        resolution: e.target.value
                      }
                    });
                  }}
                  className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="3840x2160">4K (3840x2160)</option>
                  <option value="1920x1080">Full HD (1920x1080)</option>
                  <option value="1280x720">HD (1280x720)</option>
                  <option value="854x480">SD (854x480)</option>
                </select>
              </div>

              {/* FPS */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Frame Rate (FPS)
                </label>
                <select
                  value={selectedCamera.quality_settings?.fps || 30}
                  onChange={(e) => {
                    livestreamStorage.updateCamera(selectedCamera.id, {
                      quality_settings: {
                        ...selectedCamera.quality_settings,
                        fps: parseInt(e.target.value)
                      }
                    });
                  }}
                  className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="60">60 FPS</option>
                  <option value="30">30 FPS</option>
                  <option value="24">24 FPS</option>
                </select>
              </div>

              {/* Bitrate */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Bitrate
                </label>
                <select
                  value={selectedCamera.quality_settings?.bitrate || '2500'}
                  onChange={(e) => {
                    livestreamStorage.updateCamera(selectedCamera.id, {
                      quality_settings: {
                        ...selectedCamera.quality_settings,
                        bitrate: e.target.value
                      }
                    });
                  }}
                  className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="6000">High (6000 kbps)</option>
                  <option value="4500">Medium-High (4500 kbps)</option>
                  <option value="2500">Medium (2500 kbps)</option>
                  <option value="1500">Low (1500 kbps)</option>
                </select>
              </div>
            </div>

            <div className="flex gap-3 p-6 border-t border-slate-700">
              <button
                onClick={() => {
                  setShowSettings(false);
                  setSelectedCamera(null);
                }}
                className="flex-1 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg font-medium transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* QR Code Modal */}
      {showQRModal && (
        <MobileCameraQRModal
          sessionId={sessionId}
          onClose={() => setShowQRModal(false)}
        />
      )}

      {/* Tips Section */}
      <div className="bg-blue-500/10 border border-blue-500/30 rounded-xl p-4">
        <h4 className="font-semibold text-blue-300 mb-2 flex items-center gap-2">
          <Camera className="w-4 h-4" />
          Multi-Camera Tips
        </h4>
        <ul className="text-sm text-blue-200/80 space-y-1">
          <li>• <strong>Primary Camera:</strong> The camera currently being streamed to YouTube</li>
          <li>• <strong>Mobile Phones:</strong> Perfect for flexible positioning and mobility</li>
          <li>• <strong>Action Cameras:</strong> GoPro/Insta360 for on-boat and dynamic footage</li>
          <li>• <strong>Laptop Cameras:</strong> Great for commentary and static views</li>
          <li>• <strong>Quality vs Bandwidth:</strong> Higher settings require faster internet connection</li>
          <li>• <strong>Switching Cameras:</strong> Switch between cameras during the live stream</li>
        </ul>
      </div>
    </div>
  );
}
