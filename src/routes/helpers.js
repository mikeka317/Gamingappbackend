const express = require('express');
const axios = require('axios');

const router = express.Router();

// GET /api/helpers/countries
router.get('/countries', async (req, res) => {
  try {
    // Prefer v3.1 with explicit fields to avoid 400s
    const { data } = await axios.get('https://restcountries.com/v3.1/all?fields=cca2,name', { timeout: 15000 });

    const result = (Array.isArray(data) ? data : [])
      .map((c) => ({ countryCode: c.cca2, countryName: c?.name?.common }))
      .filter((x) => x.countryCode && x.countryName)
      .sort((a, b) => a.countryName.localeCompare(b.countryName));

    return res.json({ success: true, data: result });
  } catch (err) {
    console.warn('⚠️ v3.1 countries fetch failed, falling back to v2:', err?.message);
    try {
      // Fallback to v2 API if v3.1 fails
      const { data } = await axios.get('https://restcountries.com/v2/all?fields=alpha2Code,name', { timeout: 15000 });
      const result = (Array.isArray(data) ? data : [])
        .map((c) => ({ countryCode: c.alpha2Code, countryName: c?.name }))
        .filter((x) => x.countryCode && x.countryName)
        .sort((a, b) => a.countryName.localeCompare(b.countryName));
      return res.json({ success: true, data: result });
    } catch (err2) {
      console.error('Error fetching countries (both v3.1 and v2 failed):', err2?.message || err2);
      return res.status(500).json({ success: false, message: 'Failed to fetch countries' });
    }
  }
});

module.exports = router;


