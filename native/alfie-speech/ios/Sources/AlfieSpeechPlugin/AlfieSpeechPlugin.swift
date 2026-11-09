import Foundation
import AVFoundation
import Speech
import Capacitor

/// Listens for sail numbers while the finish caller holds the voice button.
/// Sends the whole transcript so far as "partial" events, then "final" and "end".
@objc(AlfieSpeechPlugin)
public class AlfieSpeechPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "AlfieSpeechPlugin"
    public let jsName = "AlfieSpeech"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "available", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestPermission", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "start", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stop", returnType: CAPPluginReturnPromise)
    ]

    private let audioEngine = AVAudioEngine()
    private var request: SFSpeechAudioBufferRecognitionRequest?
    private var task: SFSpeechRecognitionTask?
    private var recognizer: SFSpeechRecognizer?
    private var tapInstalled = false
    private var ended = true
    private var savedCategory: AVAudioSession.Category?
    private var savedMode: AVAudioSession.Mode = .default
    private var savedOptions: AVAudioSession.CategoryOptions = []

    private func makeRecognizer(_ language: String) -> SFSpeechRecognizer? {
        return SFSpeechRecognizer(locale: Locale(identifier: language)) ?? SFSpeechRecognizer()
    }

    @objc func available(_ call: CAPPluginCall) {
        let rec = makeRecognizer(call.getString("language") ?? "en-AU")
        call.resolve(["available": rec?.isAvailable ?? false])
    }

    @objc func requestPermission(_ call: CAPPluginCall) {
        SFSpeechRecognizer.requestAuthorization { status in
            guard status == .authorized else {
                call.resolve(["granted": false])
                return
            }
            AVAudioSession.sharedInstance().requestRecordPermission { granted in
                call.resolve(["granted": granted])
            }
        }
    }

    @objc func start(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            self.teardown(notify: false)
            guard SFSpeechRecognizer.authorizationStatus() == .authorized else {
                call.reject("permission")
                return
            }
            let language = call.getString("language") ?? "en-AU"
            guard let rec = self.makeRecognizer(language), rec.isAvailable else {
                call.reject("unavailable")
                return
            }
            self.recognizer = rec
            do {
                let session = AVAudioSession.sharedInstance()
                self.savedCategory = session.category
                self.savedMode = session.mode
                self.savedOptions = session.categoryOptions
                // playAndRecord keeps StartBox horns and the race clock audible while listening
                try session.setCategory(.playAndRecord, mode: .measurement, options: [.duckOthers, .defaultToSpeaker, .allowBluetooth, .allowBluetoothA2DP])
                try session.setActive(true, options: .notifyOthersOnDeactivation)
            } catch {
                call.reject("audio")
                return
            }

            let req = SFSpeechAudioBufferRecognitionRequest()
            req.shouldReportPartialResults = true
            req.taskHint = .dictation
            // the race's sail numbers, so "fifty eight" comes back as 58
            req.contextualStrings = (call.getArray("hints") as? [String]) ?? []
            if #available(iOS 16.0, *) {
                req.addsPunctuation = false
            }
            self.request = req

            let input = self.audioEngine.inputNode
            let format = input.outputFormat(forBus: 0)
            input.installTap(onBus: 0, bufferSize: 1024, format: format) { buffer, _ in
                req.append(buffer)
            }
            self.tapInstalled = true
            self.audioEngine.prepare()
            do {
                try self.audioEngine.start()
            } catch {
                self.teardown(notify: false)
                call.reject("microphone")
                return
            }

            self.ended = false
            self.task = rec.recognitionTask(with: req) { [weak self] result, error in
                guard let self = self else { return }
                if let result = result {
                    let text = result.bestTranscription.formattedString
                    self.notifyListeners(result.isFinal ? "final" : "partial", data: ["text": text])
                    if result.isFinal {
                        DispatchQueue.main.async { self.teardown(notify: true) }
                        return
                    }
                }
                if let error = error as NSError? {
                    // 1110: nothing was said; not worth telling the caller
                    if error.code != 1110 && error.code != 216 {
                        self.notifyListeners("error", data: ["message": "Couldn't hear that."])
                    }
                    DispatchQueue.main.async { self.teardown(notify: true) }
                }
            }
            call.resolve()
        }
    }

    @objc func stop(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            // stop listening; the recogniser then sends its final transcript
            if self.audioEngine.isRunning {
                self.audioEngine.stop()
            }
            if self.tapInstalled {
                self.audioEngine.inputNode.removeTap(onBus: 0)
                self.tapInstalled = false
            }
            self.request?.endAudio()
            call.resolve()
        }
    }

    private func teardown(notify: Bool) {
        if audioEngine.isRunning {
            audioEngine.stop()
        }
        if tapInstalled {
            audioEngine.inputNode.removeTap(onBus: 0)
            tapInstalled = false
        }
        request?.endAudio()
        task?.cancel()
        task = nil
        request = nil
        // hand the audio session back as it was (StartBox and AlfieTV play through it)
        if let category = savedCategory {
            try? AVAudioSession.sharedInstance().setCategory(category, mode: savedMode, options: savedOptions)
            savedCategory = nil
        }
        if notify && !ended {
            ended = true
            notifyListeners("end", data: [:])
        }
    }
}
