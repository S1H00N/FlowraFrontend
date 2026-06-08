import { useEffect, useState } from "react";
import { getGravatarProfileImageUrl } from "@/lib/gravatar";

export function useGravatarProfileImage(
  email: string | null | undefined,
  size = 160,
) {
  const [profileImageUrl, setProfileImageUrl] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    void getGravatarProfileImageUrl(email, size)
      .then((url) => {
        if (active) setProfileImageUrl(url);
      })
      .catch(() => {
        if (active) setProfileImageUrl(null);
      });

    return () => {
      active = false;
    };
  }, [email, size]);

  return profileImageUrl;
}
