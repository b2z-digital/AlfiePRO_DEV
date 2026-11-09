package com.b2zdigital.alfiepro.speech;

import android.Manifest;
import android.content.Intent;
import android.os.Bundle;
import android.speech.RecognitionListener;
import android.speech.RecognizerIntent;
import android.speech.SpeechRecognizer;

import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.util.ArrayList;

/**
 * Listens for sail numbers while the finish caller holds the voice button.
 * Sends the transcript so far as "partial" events, then "final" and "end".
 * Android stops by itself after a pause; the app starts it again while the button is held.
 */
@CapacitorPlugin(
    name = "AlfieSpeech",
    permissions = { @Permission(strings = { Manifest.permission.RECORD_AUDIO }, alias = "microphone") }
)
public class AlfieSpeechPlugin extends Plugin {

    private SpeechRecognizer recognizer;
    private boolean ended = true;

    @PluginMethod
    public void available(PluginCall call) {
        JSObject r = new JSObject();
        r.put("available", SpeechRecognizer.isRecognitionAvailable(getContext()));
        call.resolve(r);
    }

    @PluginMethod
    public void requestPermission(PluginCall call) {
        if (getPermissionState("microphone") == PermissionState.GRANTED) {
            resolveGranted(call);
        } else {
            requestPermissionForAlias("microphone", call, "microphoneCallback");
        }
    }

    @PermissionCallback
    private void microphoneCallback(PluginCall call) {
        resolveGranted(call);
    }

    private void resolveGranted(PluginCall call) {
        JSObject r = new JSObject();
        r.put("granted", getPermissionState("microphone") == PermissionState.GRANTED);
        call.resolve(r);
    }

    @PluginMethod
    public void start(PluginCall call) {
        if (getPermissionState("microphone") != PermissionState.GRANTED) {
            call.reject("permission");
            return;
        }
        final String language = call.getString("language", "en-AU");
        getActivity().runOnUiThread(() -> {
            destroyRecognizer();
            if (!SpeechRecognizer.isRecognitionAvailable(getContext())) {
                call.reject("unavailable");
                return;
            }
            recognizer = SpeechRecognizer.createSpeechRecognizer(getContext());
            recognizer.setRecognitionListener(new Listener());
            Intent intent = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
            intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
            intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE, language);
            intent.putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true);
            intent.putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1);
            intent.putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS, 2500L);
            intent.putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_POSSIBLY_COMPLETE_SILENCE_LENGTH_MILLIS, 2500L);
            ended = false;
            recognizer.startListening(intent);
            call.resolve();
        });
    }

    @PluginMethod
    public void stop(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            if (recognizer != null) {
                recognizer.stopListening();
            }
            call.resolve();
        });
    }

    @Override
    protected void handleOnDestroy() {
        destroyRecognizer();
    }

    private void destroyRecognizer() {
        if (recognizer != null) {
            recognizer.destroy();
            recognizer = null;
        }
    }

    private void emitEnd() {
        if (!ended) {
            ended = true;
            notifyListeners("end", new JSObject());
        }
    }

    private static String best(Bundle bundle) {
        if (bundle == null) return "";
        ArrayList<String> matches = bundle.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
        return matches != null && !matches.isEmpty() ? matches.get(0) : "";
    }

    private class Listener implements RecognitionListener {
        @Override public void onReadyForSpeech(Bundle params) {}
        @Override public void onBeginningOfSpeech() {}
        @Override public void onRmsChanged(float rmsdB) {}
        @Override public void onBufferReceived(byte[] buffer) {}
        @Override public void onEndOfSpeech() {}
        @Override public void onEvent(int eventType, Bundle params) {}

        @Override
        public void onPartialResults(Bundle partialResults) {
            JSObject d = new JSObject();
            d.put("text", best(partialResults));
            notifyListeners("partial", d);
        }

        @Override
        public void onResults(Bundle results) {
            JSObject d = new JSObject();
            d.put("text", best(results));
            notifyListeners("final", d);
            emitEnd();
        }

        @Override
        public void onError(int error) {
            // no match / speech timeout: nothing was said, which isn't worth telling the caller
            if (error != SpeechRecognizer.ERROR_NO_MATCH && error != SpeechRecognizer.ERROR_SPEECH_TIMEOUT && error != SpeechRecognizer.ERROR_CLIENT) {
                JSObject d = new JSObject();
                d.put("message", error == SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS ? "Allow the microphone for AlfiePRO in Settings." : "Couldn't hear that.");
                notifyListeners("error", d);
            }
            emitEnd();
        }
    }
}
