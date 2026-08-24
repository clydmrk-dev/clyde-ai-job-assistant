export default function handler(request) {
  return new Response(
    JSON.stringify({
      success: true,
      message: "Clyde API is working"
    }),
    {
      status: 200,
      headers: {
        "Content-Type": "application/json"
      }
    }
  );
}
