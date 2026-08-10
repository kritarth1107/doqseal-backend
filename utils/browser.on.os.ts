export function getBrowserOnOS(userAgent: string): string {
    let browser = "Unknown Browser";
    let os = "Unknown OS";
  
    // Detect Browser
    if (/firefox/i.test(userAgent)) {
      browser = "Firefox";
    } else if (/edg/i.test(userAgent)) {
      browser = "Edge";
    } else if (/opr|opera/i.test(userAgent)) {
      browser = "Opera";
    } else if (/chrome/i.test(userAgent) && !/edg/i.test(userAgent) && !/opr|opera/i.test(userAgent)) {
      browser = "Chrome";
    } else if (/safari/i.test(userAgent) && /version/i.test(userAgent)) {
      browser = "Safari";
    }
  
    // Detect OS
    if (/windows nt 10/i.test(userAgent)) {
      os = "Windows 10";
    } else if (/windows nt 11/i.test(userAgent)) {
      os = "Windows 11";
    } else if (/windows nt/i.test(userAgent)) {
      os = "Windows";
    } else if (/macintosh|mac os x/i.test(userAgent)) {
      os = "MacOS";
    } else if (/android/i.test(userAgent)) {
      os = "Android";
    } else if (/iphone|ipad|ipod/i.test(userAgent)) {
      os = "iOS";
    } else if (/linux/i.test(userAgent) && /ubuntu/i.test(userAgent)) {
      os = "Ubuntu";
    } else if (/linux/i.test(userAgent)) {
      os = "Linux";
    }
  
    return `${browser} on ${os}`;
  }
  