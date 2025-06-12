chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "authenticate") {
    chrome.identity.getAuthToken({ 
      interactive: true,
      scopes: [
        'https://www.googleapis.com/auth/gmail.modify',
        'https://www.googleapis.com/auth/gmail.labels',
        'https://www.googleapis.com/auth/gmail.settings.basic'
      ]
    }, function (token) {
      if (chrome.runtime.lastError) {
        console.error("Auth Error:", chrome.runtime.lastError.message);
        sendResponse({ success: false, error: chrome.runtime.lastError.message });
        return;
      }

      // Verify the token has the correct scopes
      fetch('https://www.googleapis.com/oauth2/v1/tokeninfo?access_token=' + token)
        .then(response => response.json())
        .then(data => {
          console.log("Token info:", data);
          if (!data.scope || !data.scope.includes('https://www.googleapis.com/auth/gmail.modify')) {
            console.error("Token missing required scopes:", data.scope);
            sendResponse({ success: false, error: "Token missing required scopes" });
            return;
          }
          console.log("OAuth Token:", token);
          sendResponse({ success: true, token });
        })
        .catch(error => {
          console.error("Token verification failed:", error);
          sendResponse({ success: false, error: "Token verification failed" });
        });
    });

    return true;
  }

  if (message.type === "clean_inbox") {
    chrome.identity.getAuthToken({ 
      interactive: true,
      scopes: [
        'https://www.googleapis.com/auth/gmail.modify',
        'https://www.googleapis.com/auth/gmail.labels',
        'https://www.googleapis.com/auth/gmail.settings.basic'
      ]
    }, async function (token) {
      if (chrome.runtime.lastError || !token) {
        console.error("Token Error:", chrome.runtime.lastError?.message);
        sendResponse({ success: false, error: chrome.runtime.lastError?.message });
        return;
      }

      try {
        console.log("Cleaning inbox...");
        await cleanInbox(token);
        sendResponse({ success: true });
      } catch (error) {
        console.error("Clean inbox error:", error);
        sendResponse({ success: false, error: error.message });
      }
    });

    return true;
  }
});

// 🔍 Get list of promo emails
async function listPromotionalEmails(token) {
  const query = "category:promotions";
  const res = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(
      query
    )}&maxResults=100`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  if (!res.ok) {
    const errorText = await res.text();
    console.error("List Error Response:", errorText);
    throw new Error("List Error: " + errorText);
  }

  const data = await res.json();
  return data.messages?.map((msg) => msg.id) || [];
}

// 🏷️ Modify labels for messages
async function modifyMessageLabels(token, messageIds) {
  if (messageIds.length === 0) return;

  // First, get the TRASH label ID
  const labelsRes = await fetch(
    'https://gmail.googleapis.com/gmail/v1/users/me/labels',
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  if (!labelsRes.ok) {
    throw new Error("Failed to get labels");
  }

  const labels = await labelsRes.json();
  const trashLabel = labels.labels.find(label => label.name === 'TRASH');
  
  if (!trashLabel) {
    throw new Error("Could not find TRASH label");
  }

  // Modify labels for each message
  for (const id of messageIds) {
    const res = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}/modify`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          addLabelIds: [trashLabel.id],
          removeLabelIds: ['INBOX']
        })
      }
    );

    if (!res.ok) {
      const errorText = await res.text();
      console.error(`Failed to modify labels for ${id}:`, errorText);
      try {
        const errorJson = JSON.parse(errorText);
        console.error("Error details:", errorJson);
      } catch (e) {
        console.error("Raw error text:", errorText);
      }
    } else {
      console.log(`🏷️ Modified labels for message: ${id}`);
    }
  }
}

// 🔁 Clean inbox (promo)
async function cleanInbox(token) {
  try {
    console.log("📥 Cleaning inbox...");

    const messageIds = await listPromotionalEmails(token);
    console.log("Found message IDs:", messageIds);

    if (messageIds.length === 0) {
      console.log("No promotional emails found.");
      return;
    }

    console.log(`Found ${messageIds.length} promo emails.`);

    // Process in batches of 50
    const batchSize = 50;
    for (let i = 0; i < messageIds.length; i += batchSize) {
      const batch = messageIds.slice(i, i + batchSize);
      await modifyMessageLabels(token, batch);
    }

    console.log("✅ Moved promotional emails to trash.");
  } catch (err) {
    console.error("❌ Error cleaning inbox:", err.message);
    throw err;
  }
}
