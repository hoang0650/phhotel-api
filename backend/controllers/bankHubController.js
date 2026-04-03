const axios = require('axios');

function getBankHubBaseUrl() {
  return process.env.BANKHUB_SANDBOX === 'true'
    ? 'https://bankhub-api-sandbox.sepay.vn'
    : 'https://bankhub-api.sepay.vn';
}

let cachedToken = null;
let tokenExpiresAt = 0;

// Cached company_xid (auto-created if not set in .env)
let cachedCompanyXid = null;

async function getAccessToken() {
  if (cachedToken && Date.now() < tokenExpiresAt) {
    return cachedToken;
  }

  const clientId = process.env.BANKHUB_CLIENT_ID;
  const clientSecret = process.env.BANKHUB_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error('BANKHUB_CLIENT_ID and BANKHUB_CLIENT_SECRET are required');
  }

  const response = await axios.post(`${getBankHubBaseUrl()}/v1/token`, null, {
    auth: { username: clientId, password: clientSecret }
  });

  cachedToken = response.data.access_token;
  tokenExpiresAt = Date.now() + (response.data.ttl || 60000) - 5000;
  return cachedToken;
}

async function getOrCreateCompanyXid(accessToken) {
  // 1. Use env if set
  if (process.env.BANKHUB_COMPANY_XID) {
    return process.env.BANKHUB_COMPANY_XID;
  }
  // 2. Use cache
  if (cachedCompanyXid) {
    return cachedCompanyXid;
  }
  // 3. Try to get existing companies
  try {
    const listRes = await axios.get(`${getBankHubBaseUrl()}/v1/company`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    const companies = listRes.data?.data || listRes.data || [];
    if (Array.isArray(companies) && companies.length > 0) {
      cachedCompanyXid = companies[0].xid;
      return cachedCompanyXid;
    }
  } catch (err) {
    console.error('Error listing companies:', err.response?.data || err.message);
  }
  // 4. Auto-create company
  try {
    const createRes = await axios.post(`${getBankHubBaseUrl()}/v1/company/create`, {
      full_name: 'PHHotel',
      status: 'Active'
    }, {
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }
    });
    cachedCompanyXid = createRes.data?.data?.xid || createRes.data?.xid;
    console.log('Auto-created BankHub company:', cachedCompanyXid);
    return cachedCompanyXid;
  } catch (err) {
    console.error('Error creating company:', err.response?.data || err.message);
    throw new Error('Cannot get or create BankHub company');
  }
}

// GET /bankhub/status
exports.getStatus = async (req, res) => {
  try {
    const hasConfig = !!(process.env.BANKHUB_CLIENT_ID && process.env.BANKHUB_CLIENT_SECRET);
    if (!hasConfig) {
      return res.json({ configured: false, message: 'BankHub credentials not configured' });
    }
    try {
      const accessToken = await getAccessToken();
      const companyXid = await getOrCreateCompanyXid(accessToken);
      res.json({ configured: true, authenticated: true, company_xid: companyXid });
    } catch (err) {
      res.json({ configured: true, authenticated: false, message: err.message });
    }
  } catch (error) {
    res.status(500).json({ error: 'Failed to check BankHub status' });
  }
};

// POST /bankhub/link-token
exports.createLinkToken = async (req, res) => {
  try {
    const { purpose, completion_redirect_uri } = req.body;
    const accessToken = await getAccessToken();
    const companyXid = await getOrCreateCompanyXid(accessToken);

    const payload = {
      company_xid: companyXid,
      purpose: purpose || 'LINK_BANK_ACCOUNT'
    };
    if (completion_redirect_uri) {
      payload.completion_redirect_uri = completion_redirect_uri;
    }

    const response = await axios.post(`${getBankHubBaseUrl()}/v1/link-token/create`, payload, {
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }
    });

    res.status(201).json(response.data);
  } catch (error) {
    console.error('Error creating link token:', error.response?.data || error.message);
    res.status(error.response?.status || 500).json({
      error: 'Failed to create link token',
      message: error.response?.data?.message || error.message
    });
  }
};

// GET /bankhub/bank-accounts
exports.getBankAccounts = async (req, res) => {
  try {
    const accessToken = await getAccessToken();
    const companyXid = await getOrCreateCompanyXid(accessToken);

    const response = await axios.get(`${getBankHubBaseUrl()}/v1/bank-account`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      params: { company_xid: companyXid }
    });

    res.json(response.data);
  } catch (error) {
    console.error('Error getting bank accounts:', error.response?.data || error.message);
    res.status(error.response?.status || 500).json({
      error: 'Failed to get bank accounts',
      message: error.response?.data?.message || error.message
    });
  }
};

// GET /bankhub/transactions
exports.getTransactions = async (req, res) => {
  try {
    const { bank_account_xid, from_date, to_date, page, limit } = req.query;
    const accessToken = await getAccessToken();
    const companyXid = await getOrCreateCompanyXid(accessToken);

    const params = { company_xid: companyXid };
    if (bank_account_xid) params.bank_account_xid = bank_account_xid;
    if (from_date) params.from_date = from_date;
    if (to_date) params.to_date = to_date;
    if (page) params.page = page;
    if (limit) params.limit = limit;

    const response = await axios.get(`${getBankHubBaseUrl()}/v1/transaction`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      params
    });

    res.json(response.data);
  } catch (error) {
    console.error('Error getting transactions:', error.response?.data || error.message);
    res.status(error.response?.status || 500).json({
      error: 'Failed to get transactions',
      message: error.response?.data?.message || error.message
    });
  }
};

// POST /bankhub/company - Create company manually
exports.createCompany = async (req, res) => {
  try {
    const { full_name } = req.body;
    if (!full_name) {
      return res.status(400).json({ error: 'full_name is required' });
    }
    const accessToken = await getAccessToken();
    const response = await axios.post(`${getBankHubBaseUrl()}/v1/company/create`, {
      full_name,
      status: 'Active'
    }, {
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }
    });
    cachedCompanyXid = response.data?.data?.xid || response.data?.xid;
    res.status(201).json(response.data);
  } catch (error) {
    console.error('Error creating company:', error.response?.data || error.message);
    res.status(error.response?.status || 500).json({
      error: 'Failed to create company',
      message: error.response?.data?.message || error.message
    });
  }
};

// GET /bankhub/companies - List companies
exports.getCompanies = async (req, res) => {
  try {
    const accessToken = await getAccessToken();
    const response = await axios.get(`${getBankHubBaseUrl()}/v1/company`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    res.json(response.data);
  } catch (error) {
    console.error('Error listing companies:', error.response?.data || error.message);
    res.status(error.response?.status || 500).json({
      error: 'Failed to list companies',
      message: error.response?.data?.message || error.message
    });
  }
};
