import { LicenseKeyRecord } from './types';
import { computeSha256Hex } from './hashUtils';

export interface GitHubSyncConfig {
  owner: string;
  repo: string;
  branch: string;
  token?: string; // Optional GitHub Personal Access Token with repo/content write permissions
  autoSync?: boolean; // When true, automatically syncs changes to GitHub on activate/revoke/delete/create
}

const GITHUB_CONFIG_STORAGE_KEY = 'receipt_processor_gh_config';

export function getStoredGitHubConfig(): GitHubSyncConfig {
  try {
    const saved = localStorage.getItem(GITHUB_CONFIG_STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      return {
        ...parsed,
        autoSync: parsed.autoSync !== false // default to true
      };
    }
  } catch {}
  return {
    owner: 'moisttowlett247-a11y',
    repo: 'receipt-processor-portal',
    branch: 'main',
    token: '',
    autoSync: true
  };
}

export function saveStoredGitHubConfig(cfg: GitHubSyncConfig) {
  try {
    localStorage.setItem(GITHUB_CONFIG_STORAGE_KEY, JSON.stringify(cfg));
  } catch {}
}

export interface LicenseHashFileContent {
  status: 'ACTIVE' | 'REVOKED' | 'EXPIRED';
  plan: string;
  expires: string;
  issued: string;
  hwid?: string | null;
  updatedAt: string;
}

export function getEffectiveStatus(k: LicenseKeyRecord): 'ACTIVE' | 'REVOKED' | 'EXPIRED' {
  if (k.status === 'NOT ACTIVE') return 'REVOKED';
  if (k.status === 'EXPIRED') return 'EXPIRED';
  if (k.plan === 'ADMIN' || k.expiresDate?.includes('Never') || k.expiresDate?.includes('Lifetime')) {
    return 'ACTIVE';
  }
  if (k.expiresDate && !k.expiresDate.startsWith('Pending')) {
    const expTime = new Date(k.expiresDate).getTime();
    if (!isNaN(expTime) && expTime < new Date().setHours(0, 0, 0, 0)) {
      return 'EXPIRED';
    }
  }
  return 'ACTIVE';
}

export function buildHashFileContent(k: LicenseKeyRecord): LicenseHashFileContent {
  return {
    status: getEffectiveStatus(k),
    plan: k.plan,
    expires: k.expiresDate,
    issued: k.issuedDate,
    hwid: k.hardwareId || null,
    updatedAt: new Date().toISOString()
  };
}

/**
 * Pushes or deletes a hash file directly to GitHub Repository using GitHub Contents API
 */
export async function syncSingleKeyToGitHub(
  k: LicenseKeyRecord,
  action: 'UPSERT' | 'DELETE',
  config: GitHubSyncConfig
): Promise<{ success: boolean; message: string }> {
  if (!config.token) {
    return {
      success: false,
      message: 'GitHub Token required for direct sync. Use the 1-Click download or configure your token in Admin Settings.'
    };
  }

  const hash = await computeSha256Hex(k.key);
  const filePath = `public/licenses/${hash}.json`;
  const url = `https://api.github.com/repos/${config.owner}/${config.repo}/contents/${filePath}`;

  try {
    // 1. Check if file already exists to get its SHA (required for GitHub PUT updates and DELETE)
    let currentFileSha: string | undefined = undefined;
    try {
      const getResp = await fetch(url, {
        headers: {
          Authorization: `Bearer ${config.token}`,
          Accept: 'application/vnd.github.v3+json'
        }
      });
      if (getResp.ok) {
        const fileData = await getResp.json();
        currentFileSha = fileData.sha;
      }
    } catch {}

    if (action === 'DELETE') {
      if (!currentFileSha) {
        return { success: true, message: `File for ${k.key} was already absent on GitHub.` };
      }
      const delResp = await fetch(url, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${config.token}`,
          Accept: 'application/vnd.github.v3+json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          message: `Delete license hash file for ${k.id} [skip ci]`,
          sha: currentFileSha,
          branch: config.branch
        })
      });
      if (delResp.ok) {
        return { success: true, message: `Successfully deleted hash file on GitHub.` };
      } else {
        const err = await delResp.json().catch(() => ({}));
        return { success: false, message: `GitHub Delete Failed: ${err.message || delResp.statusText}` };
      }
    }

    // Action: UPSERT
    const contentObj = buildHashFileContent(k);
    const contentStr = JSON.stringify(contentObj, null, 2);
    // Base64 encode string safely for utf-8
    const contentBase64 = btoa(unescape(encodeURIComponent(contentStr)));

    const putBody: any = {
      message: `Sync license hash for ${k.id} (${contentObj.status}) [skip ci]`,
      content: contentBase64,
      branch: config.branch
    };
    if (currentFileSha) {
      putBody.sha = currentFileSha;
    }

    const putResp = await fetch(url, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${config.token}`,
        Accept: 'application/vnd.github.v3+json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(putBody)
    });

    if (putResp.ok) {
      return { success: true, message: `Hash file updated on GitHub (${contentObj.status}).` };
    } else {
      const err = await putResp.json().catch(() => ({}));
      return { success: false, message: `GitHub Put Failed: ${err.message || putResp.statusText}` };
    }
  } catch (err: any) {
    return { success: false, message: `Network Error: ${err.message}` };
  }
}
