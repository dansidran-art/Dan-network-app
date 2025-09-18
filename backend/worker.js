/* ------------------- KYC Verification with Gemini ------------------- */

// POST /api/kyc/verify
app.post("/api/kyc/verify", requireAuth, async (c) => {
  const db = c.env.DB;
  const user = c.get("user");

  // Get files (multipart form-data: { id_image, selfie })
  const formData = await c.req.parseBody();

  const idImage = formData["id_image"];
  const selfie = formData["selfie"];

  if (!idImage || !selfie) {
    return c.json({ error: "Missing required files (id_image, selfie)" }, 400);
  }

  try {
    // Call Gemini API for face + ID match
    const geminiResp = await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-pro-vision:generateContent?key=" + c.env.GEMINI_API_KEY, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: "Compare if this face matches the ID document. Respond with only 'MATCH' or 'NO_MATCH'." },
              { inline_data: { mime_type: idImage.type, data: await fileToBase64(idImage) } },
              { inline_data: { mime_type: selfie.type, data: await fileToBase64(selfie) } }
            ]
          }
        ]
      }),
    });

    const data = await geminiResp.json();
    const resultText = data?.candidates?.[0]?.content?.parts?.[0]?.text || "NO_MATCH";

    if (resultText.includes("MATCH")) {
      // Update DB
      await db
        .prepare("UPDATE users SET is_kyc_verified = 1 WHERE id = ?")
        .bind(user.id)
        .run();

      return c.json({ success: true, message: "KYC verification successful. Your account is now verified." });
    } else {
      return c.json({ success: false, message: "KYC verification failed. Please try again." }, 400);
    }
  } catch (err) {
    return c.json({ error: "Gemini verification failed", details: err.message }, 500);
  }
});

/* ------------------- Helper: fileToBase64 ------------------- */
async function fileToBase64(file) {
  const arrayBuffer = await file.arrayBuffer();
  let binary = "";
  const bytes = new Uint8Array(arrayBuffer);
  for (let b of bytes) {
    binary += String.fromCharCode(b);
  }
  return btoa(binary);
}