import { describe, expect, it } from 'vitest';
import { Timestamp } from 'firebase/firestore';
import {
  monthKeyFromDate,
  monthLabelFromDate,
  timestampToMillis,
  orderFromDocument,
  profileFromDocument,
  hasStaffAccess,
  normalizeRole,
  slugifyAgencyId
} from './appModel';
import { md5PhoneKey, md5EmailKey } from './privacy';

describe('Privacy MD5 hashing helpers', () => {
  it('should correctly hash email keys using md5', () => {
    // lowercase & trimmed
    const hash = md5EmailKey(' TEST@example.com ');
    expect(hash).toBe('55502f40dc8b7c769880b10874abc9d0'); // MD5 of "test@example.com"
  });

  it('should return null for empty email keys', () => {
    expect(md5EmailKey('')).toBeNull();
    expect(md5EmailKey('   ')).toBeNull();
  });

  it('should correctly hash phone keys', () => {
    const hash = md5PhoneKey(' 07700900077 ');
    expect(hash).toBe('91ef2d3afcf735ecb9e260b0ae01fc1d'); // MD5 of "07700900077"
  });

  it('should return null for empty phone keys', () => {
    expect(md5PhoneKey('')).toBeNull();
  });
});

describe('Date and Month Helpers', () => {
  it('should format month key correctly', () => {
    const date = new Date(2026, 5, 15); // June 15, 2026
    expect(monthKeyFromDate(date)).toBe('2026-06');
  });

  it('should format month label correctly', () => {
    const date = new Date(2026, 5, 15);
    expect(monthLabelFromDate(date)).toBe('Jun 2026');
  });

  it('should return milliseconds or 0 for timestamps', () => {
    expect(timestampToMillis(null)).toBe(0);
    const ts = Timestamp.fromMillis(1717171717000);
    expect(timestampToMillis(ts)).toBe(1717171717000);
  });
});

describe('Firestore Document Mappers', () => {
  it('should map document data to LiveOrder correctly', () => {
    const rawData = {
      agencyId: 'plus_dane',
      agencyName: 'Plus Dane Housing',
      recipientName: 'Alice',
      recipientPhone: '07700900077',
      recipientEmail: 'alice@example.com',
      targetCollectionTime: '12:00',
      familySize: 3,
      dietaryNotes: 'None',
      status: 'Ready for Collection',
      submittedBy: 'partner@example.com',
      createdAt: Timestamp.fromMillis(1717171717000)
    };

    const order = orderFromDocument('doc-123', rawData);
    expect(order.id).toBe('doc-123');
    expect(order.agencyId).toBe('plus_dane');
    expect(order.familySize).toBe(3);
    expect(order.status).toBe('Ready for Collection');
    expect(order.createdAt).toBeInstanceOf(Timestamp);
    expect(order.createdAt?.toMillis()).toBe(1717171717000);
  });

  it('should fallback to default values in orderFromDocument', () => {
    const order = orderFromDocument('doc-empty', {});
    expect(order.recipientName).toBe('');
    expect(order.familySize).toBe(1);
    expect(order.status).toBe('New');
    expect(order.createdAt).toBeNull();
  });

  it('should map profileFromDocument correctly', () => {
    const rawData = {
      email: 'jane@example.com',
      name: 'Jane Doe',
      role: 'partner',
      agencyId: 'plus_dane',
      agencyName: 'Plus Dane Housing'
    };

    const profile = profileFromDocument('user-123', rawData);
    expect(profile.id).toBe('user-123');
    expect(profile.email).toBe('jane@example.com');
    expect(profile.role).toBe('partner');
    expect(profile.agencyName).toBe('Plus Dane Housing');
  });

  it('should use fallbacks in profileFromDocument', () => {
    const profile = profileFromDocument('user-empty', {}, 'fallback@example.com');
    expect(profile.email).toBe('fallback@example.com');
    expect(profile.role).toBe('pending');
    expect(profile.agencyId).toBeNull();
  });
});

describe('User Access Control and Roles', () => {
  it('should detect staff access', () => {
    expect(hasStaffAccess('admin')).toBe(true);
    expect(hasStaffAccess('active_volunteer')).toBe(true);
    expect(hasStaffAccess('partner')).toBe(false);
    expect(hasStaffAccess('pending')).toBe(false);
  });

  it('should normalize user roles correctly', () => {
    expect(normalizeRole('ADMIN')).toBe('admin');
    expect(normalizeRole('volunteer')).toBe('active_volunteer');
    expect(normalizeRole('partner')).toBe('partner');
    expect(normalizeRole('unknown')).toBe('pending');
    expect(normalizeRole('', 'stokie2605@gmail.com')).toBe('admin');
  });

  it('should slugify agency names correctly', () => {
    expect(slugifyAgencyId(' Plus Dane Housing! ')).toBe('plus_dane_housing');
    expect(slugifyAgencyId('')).toContain('agency_');
  });
});
