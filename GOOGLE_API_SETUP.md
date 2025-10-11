# Google Civic Information API Setup

To enable the "Find My Lawmakers" feature, you need a Google Civic Information API key.

## Quick Setup (2 minutes)

1. **Go to Google Cloud Console**
   - Visit: https://console.cloud.google.com/apis/credentials

2. **Create or Select a Project**
   - Click "Select a project" at the top
   - Click "NEW PROJECT" or select an existing one
   - Click "CREATE"

3. **Enable the Civic Information API**
   - Visit: https://console.cloud.google.com/apis/library/civicinfo.googleapis.com
   - Click "ENABLE"

4. **Create API Key**
   - Go back to: https://console.cloud.google.com/apis/credentials
   - Click "+ CREATE CREDENTIALS" → "API key"
   - Copy the generated API key

5. **Add Key to Your Project**
   - Open `.env.local` in the project root
   - Replace `your_google_civic_api_key_here` with your actual API key:
     ```
     NEXT_PUBLIC_GOOGLE_CIVIC_API_KEY=AIzaSyD...your_actual_key
     ```

6. **Restart Dev Server**
   - Stop the dev server (Ctrl+C)
   - Run `npm run dev` again

## Security (Optional but Recommended)

To restrict your API key:

1. Go to: https://console.cloud.google.com/apis/credentials
2. Click on your API key
3. Under "API restrictions":
   - Select "Restrict key"
   - Choose "Google Civic Information API"
4. Under "Website restrictions" (if deploying):
   - Add your website domains
5. Click "SAVE"

## Free Tier

- **25,000 requests per day** for free
- Should be more than enough for most civic scorecard usage

## Troubleshooting

If you see "API key not configured":
- Make sure you saved `.env.local` with your actual key
- Restart the dev server
- Clear browser cache and refresh

If you see "API key quota exceeded":
- You've hit the daily limit (25,000 requests)
- Wait until tomorrow or upgrade to a paid plan
