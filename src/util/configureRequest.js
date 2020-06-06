import base64 from 'base-64';
import qs from 'qs';

const AUTH_URL = '/o/oauth2/token';
const BASE_URL = 'http://localhost:8080';

export default function (options = {}) {
	const {
		authURL = AUTH_URL,
		baseURL = BASE_URL,
		clientId,
		get,
		oauth,
		set,
	} = options;

	function login({password, username}) {
		return oauth
			? loginOAuth({password, username})
			: loginBasic({password, username});
	}

	function loginBasic({password, username}) {
		const access_token = base64.encode(`${username}:${password}`);

		return request('/o/headless-admin-user/v1.0/my-user-account', {
			headers: {
				Authorization: `Basic ${access_token}`,
			},
		}).then(() => {
			setAuth({
				access_token,
				token_type: 'Basic',
			});
		});
	}

	function loginOAuth({password, username}) {
		return request(authURL, {
			body: qs.stringify({
				client_id: clientId,
				grant_type: 'password',
				password,
				username,
			}),
			headers: {
				'Content-Type': 'application/x-www-form-urlencoded',
			},
			method: 'POST',
		}).then(setAuth);
	}

	function setAuth(data) {
		set('auth', {
			access_token: data.access_token,
			expire_date: data.expires_in
				? Date.now() + 1000 * data.expires_in
				: null,
			refresh_token: data.refresh_token || null,
			token_type: data.token_type,
		});

		return data;
	}

	function refreshToken(auth) {
		return request(authURL, {
			body: qs.stringify({
				client_id: clientId,
				grant_type: 'refresh_token',
				refresh_token: auth.refresh_token,
			}),
			headers: {
				'Content-Type': 'application/x-www-form-urlencoded',
			},
			method: 'POST',
		}).then(setAuth);
	}

	async function request(url, options = {}) {
		const {
			body,
			contentType = 'application/json',
			data = {},
			headers,
			method = 'GET',
			...otherOptions
		} = options;

		let requestHeaders = headers;

		const request = {method};

		if (method === 'POST') {
			request.body = body || JSON.stringify(data);
		}

		if (!requestHeaders) {
			const auth = await getAuth();

			if (!auth) {
				throw new Error('Unable to make request. Please log in.');
			}

			requestHeaders = {
				Authorization: `${auth.token_type} ${auth.access_token}`,
				'Content-Type': contentType,
			};
		}

		request.headers = requestHeaders;

		const response = await fetch(baseURL + url, {
			...request,
			...otherOptions,
		});

		if (response.ok) {
			return response.json();
		} else {
			const text = await response.text();

			let error;

			try {
				const errorObj = JSON.parse(text);

				error = errorObj.error;
			} catch (e) {
				error = text;
			}

			throw new Error(error);
		}
	}

	async function getAuth() {
		let auth = await get('auth');

		if (!auth) {
			return null;
		}

		if (auth.expire_date && Date.now() > auth.expire_date) {
			auth = await refreshToken(auth);
		}

		return auth;
	}

	return {
		getAuth,
		login,
		request,
	};
}
