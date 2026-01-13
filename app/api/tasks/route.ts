import { NextRequest, NextResponse } from 'next/server';
import {
  createTask,
  updateTask,
  getTask,
  getActiveTasks,
  getRecentTasks,
  getIncompleteTasksSummary,
  deleteTask,
} from '@/lib/db';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const userId = searchParams.get('userId') || 'default-voice-user';
  const taskId = searchParams.get('taskId');
  const type = searchParams.get('type') || 'active'; // 'active', 'recent', 'summary', 'single'
  const limit = parseInt(searchParams.get('limit') || '10');

  try {
    if (type === 'single' && taskId) {
      const task = await getTask(taskId);
      if (!task) {
        return NextResponse.json({ error: 'Task not found' }, { status: 404 });
      }
      return NextResponse.json({ task });
    }

    if (type === 'summary') {
      const summary = await getIncompleteTasksSummary(userId);
      return NextResponse.json({ summary });
    }

    if (type === 'recent') {
      const tasks = await getRecentTasks(userId, limit);
      return NextResponse.json({ tasks });
    }

    // Default: active tasks
    const tasks = await getActiveTasks(userId);
    return NextResponse.json({ tasks });
  } catch (error) {
    console.error('Error fetching tasks:', error);
    return NextResponse.json({ error: 'Failed to fetch tasks' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { taskDescription, taskType, conversationId, userId, subtasks, priority, parentTaskId } = body;

    if (!taskDescription) {
      return NextResponse.json({ error: 'taskDescription required' }, { status: 400 });
    }

    const taskId = await createTask({
      taskDescription,
      taskType,
      conversationId,
      userId,
      subtasks,
      priority,
      parentTaskId,
    });

    return NextResponse.json({ taskId });
  } catch (error) {
    console.error('Error creating task:', error);
    return NextResponse.json({ error: 'Failed to create task' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { taskId, status, subtasks, completedSubtasks, blockers, context, toolsUsed, errorMessage } = body;

    if (!taskId) {
      return NextResponse.json({ error: 'taskId required' }, { status: 400 });
    }

    await updateTask(taskId, {
      status,
      subtasks,
      completedSubtasks,
      blockers,
      context,
      toolsUsed,
      errorMessage,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error updating task:', error);
    return NextResponse.json({ error: 'Failed to update task' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const taskId = searchParams.get('taskId');

  if (!taskId) {
    return NextResponse.json({ error: 'taskId required' }, { status: 400 });
  }

  try {
    await deleteTask(taskId);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting task:', error);
    return NextResponse.json({ error: 'Failed to delete task' }, { status: 500 });
  }
}
