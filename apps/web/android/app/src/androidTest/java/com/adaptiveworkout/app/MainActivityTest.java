package com.adaptiveworkout.app;

import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;

import androidx.test.ext.junit.rules.ActivityScenarioRule;
import androidx.test.ext.junit.runners.AndroidJUnit4;

import org.junit.Rule;
import org.junit.Test;
import org.junit.runner.RunWith;

@RunWith(AndroidJUnit4.class)
public class MainActivityTest {
    @Rule
    public ActivityScenarioRule<MainActivity> activityRule =
            new ActivityScenarioRule<>(MainActivity.class);

    @Test
    public void launchesBundledWebApplication() {
        activityRule.getScenario().onActivity(activity -> {
            assertNotNull(activity.getBridge());
            assertNotNull(activity.getBridge().getWebView());
            assertTrue(activity.getBridge().getWebView().getUrl().startsWith("https://localhost"));
        });
    }
}
