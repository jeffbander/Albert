/**
 * Contacts API Route
 * Manages email contacts for name-to-email lookup
 * e.g., "email Mom" -> looks up Mom's email address
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  addContact,
  getContactByName,
  getContactByEmail,
  getAllContacts,
  searchContacts,
  updateContact,
  deleteContact,
} from '@/lib/db';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, ...params } = body;

    console.log(`[Contacts API] Action: ${action}`, params);

    switch (action) {
      // Add a new contact
      case 'add': {
        if (!params.name || !params.email) {
          return NextResponse.json(
            { success: false, error: 'Name and email are required' },
            { status: 400 }
          );
        }

        // Check if contact already exists
        const existing = await getContactByEmail(params.email);
        if (existing) {
          return NextResponse.json(
            {
              success: false,
              error: `Contact with email ${params.email} already exists (${existing.name})`,
            },
            { status: 409 }
          );
        }

        const id = await addContact(params.name, params.email, {
          nickname: params.nickname,
          notes: params.notes,
        });

        return NextResponse.json({
          success: true,
          id,
          message: `Added contact: ${params.name} (${params.email})`,
        });
      }

      // Look up a contact by name or nickname
      case 'lookup': {
        if (!params.name) {
          return NextResponse.json(
            { success: false, error: 'Name is required for lookup' },
            { status: 400 }
          );
        }

        const contact = await getContactByName(params.name);
        if (!contact) {
          return NextResponse.json({
            success: false,
            found: false,
            message: `No contact found for "${params.name}"`,
          });
        }

        return NextResponse.json({
          success: true,
          found: true,
          contact: {
            id: contact.id,
            name: contact.name,
            email: contact.email,
            nickname: contact.nickname,
          },
        });
      }

      // Search contacts
      case 'search': {
        const contacts = await searchContacts(params.query || '');
        return NextResponse.json({
          success: true,
          contacts: contacts.map((c) => ({
            id: c.id,
            name: c.name,
            email: c.email,
            nickname: c.nickname,
          })),
        });
      }

      // Update a contact
      case 'update': {
        if (!params.id) {
          return NextResponse.json(
            { success: false, error: 'Contact ID is required' },
            { status: 400 }
          );
        }

        await updateContact(params.id, {
          name: params.name,
          email: params.email,
          nickname: params.nickname,
          notes: params.notes,
        });

        return NextResponse.json({
          success: true,
          message: 'Contact updated',
        });
      }

      // Delete a contact
      case 'delete': {
        if (!params.id) {
          return NextResponse.json(
            { success: false, error: 'Contact ID is required' },
            { status: 400 }
          );
        }

        await deleteContact(params.id);
        return NextResponse.json({
          success: true,
          message: 'Contact deleted',
        });
      }

      // List all contacts
      case 'list': {
        const contacts = await getAllContacts();
        return NextResponse.json({
          success: true,
          contacts: contacts.map((c) => ({
            id: c.id,
            name: c.name,
            email: c.email,
            nickname: c.nickname,
          })),
        });
      }

      default:
        return NextResponse.json(
          { success: false, error: `Unknown action: ${action}` },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error('[Contacts API] Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Contacts operation failed',
      },
      { status: 500 }
    );
  }
}

// GET: List all contacts
export async function GET() {
  try {
    const contacts = await getAllContacts();
    return NextResponse.json({
      success: true,
      contacts: contacts.map((c) => ({
        id: c.id,
        name: c.name,
        email: c.email,
        nickname: c.nickname,
      })),
      count: contacts.length,
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to list contacts',
    });
  }
}
