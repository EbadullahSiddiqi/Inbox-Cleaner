chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "authenticate") {
    chrome.identity.getAuthToken({ interactive: true }, function (token) {
      if (chrome.runtime.lastError) {
        console.error("Auth Error:", chrome.runtime.lastError.message);
        sendResponse({ success: false });
        return;
      }

      console.log("OAuth Token:", token);
      sendResponse({ success: true, token });
    });

    return true;
  }

  if (message.type === "clean_inbox") {
    chrome.identity.getAuthToken({ interactive: true }, async function (token) {
      if (chrome.runtime.lastError || !token) {
        console.error("Token Error:", chrome.runtime.lastError?.message);
        sendResponse({ success: false });
        return;
      }

      console.log("Cleaning inbox...");
      await cleanInbox(token);
      sendResponse({ success: true });
    });

    return true;
  }
});

async function callGmailAPI(token, endpoint, method = "GET", body = null) {
  const response = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/${endpoint}`,
    {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : null,
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    console.error("Gmail API Error:", errorText);
    throw new Error(errorText);
  }

  return await response.json();
}

async function cleanInbox(token) {
  try {
    // Step 1: List messages under the "PROMOTIONS" category
    const listRes = await callGmailAPI(token, "messages?q=category:promotions");

    if (!listRes.messages || listRes.messages.length === 0) {
      console.log("No promotional emails found.");
      return;
    }

    const messageIds = listRes.messages.map((msg) => msg.id);
    console.log(`Found ${messageIds.length} promo emails.`);

    // Step 2: Batch delete
    await callGmailAPI(token, "messages/batchDelete", "POST", {
      ids: messageIds,
    });

    console.log("Deleted promotional emails.");
  } catch (err) {
    console.error("Error cleaning inbox:", err.message);
  }
}
