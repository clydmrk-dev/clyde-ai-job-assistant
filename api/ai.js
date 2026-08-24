```javascript
export default async function handler(req, res) {
  try {
    console.log("API FUNCTION STARTED");

    return res.status(200).json({
      success: true,
      message: "Clyde API is working"
    });

  } catch (error) {
    console.error("API ERROR:", error);

    return res.status(500).json({
      error: "API failed",
      message: error.message
    });
  }
}
```
