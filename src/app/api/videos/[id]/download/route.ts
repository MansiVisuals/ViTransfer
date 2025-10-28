import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getFilePath } from '@/lib/storage'
import fs from 'fs'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    // Get video metadata
    const video = await prisma.video.findUnique({
      where: { id },
      include: { project: true },
    })

    if (!video) {
      return NextResponse.json({ error: 'Video not found' }, { status: 404 })
    }

    // For approved projects, serve the original file
    // For non-approved projects, you might want to restrict this or serve preview
    const filePath = video.project.status === 'APPROVED' 
      ? video.originalStoragePath 
      : video.originalStoragePath // Or restrict access

    // Get the full file path
    const fullPath = getFilePath(filePath)

    // Check if file exists
    if (!fs.existsSync(fullPath)) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 })
    }

    // Read file as buffer
    const fileBuffer = await fs.promises.readFile(fullPath)

    // Use the original filename from the database
    const originalFilename = video.originalFileName

    // Return file with proper headers for download
    return new NextResponse(fileBuffer as any, {
      headers: {
        'Content-Type': 'video/mp4',
        'Content-Disposition': `attachment; filename="${originalFilename}"`,
        'Content-Length': fileBuffer.length.toString(),
      },
    })
  } catch (error) {
    console.error('Download error:', error)
    return NextResponse.json(
      { error: 'Failed to download file' },
      { status: 500 }
    )
  }
}
