document.getElementById("connectBtn").addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: "authenticate" }, (response) => {
    console.log("Popup got response:", response);
    document.getElementById("status").textContent =
      response?.message || "No response";
  });
});

document.getElementById("cleanBtn").addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: "clean_inbox" }, (response) => {
    if (response.success) {
      alert("Inbox cleaned!");
    } else {
      alert("Failed to clean inbox.");
    }
  });
});
