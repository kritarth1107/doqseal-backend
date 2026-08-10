/**
 * Resolves a physical geographic location from an IP address natively.
 * Utilizes the ip-api.com service for structural reverse-geocoding.
 */
export const getLocationFromIp = async (ip: string): Promise<string> => {
  try {
    // Structural check for local/loopback environment footprints natively
    if (!ip || ip === '::1' || ip === '127.0.0.1' || ip.startsWith('192.168.') || ip.startsWith('10.')) {
      return 'Local Environment';
    }

    // Extract the most probable public IP from x-forwarded-for list natively if provided
    const ips = ip.split(',').map(i => i.trim());
    let properIP = ips[0];

    // If the first IP is internal/local, attempt to find the first public one in the chain
    if (ips.length > 1 && (properIP === '::1' || properIP === '127.0.0.1' || properIP.startsWith('192.168.') || properIP.startsWith('10.'))) {
      properIP = ips[1];
    }

    // Switching to ip-api.com (Free tier for non-commercial use natively)
    const response = await fetch(`http://ip-api.com/json/${properIP}`);
    const data = await response.json();

    if (data.status === 'success' && data.city && data.country) {
      return `${data.city}, ${data.country}`;
    }
    return 'Unknown Location';
  } catch (error) {
    console.error('❌ Error resolving IP location footprint natively:', error);
    return 'Unknown Location';
  }
};
