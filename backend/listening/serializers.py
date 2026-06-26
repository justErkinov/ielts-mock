from rest_framework import serializers
from .models import ListeningTest, ListeningQuestion, ListeningAttempt

class ListeningQuestionSerializer(serializers.ModelSerializer):
    class Meta:
        model = ListeningQuestion
        fields = ['id', 'question_number', 'question_type',
                  'question_text', 'options', 'group_title', 'group_instruction']
        # correct_answer is intentionally excluded — don't leak answers to frontend

class ListeningTestSerializer(serializers.ModelSerializer):
    questions = ListeningQuestionSerializer(many=True, read_only=True)

    class Meta:
        model = ListeningTest
        fields = ['id', 'title', 'audio_url', 'questions']

class ListeningAttemptSerializer(serializers.ModelSerializer):
    class Meta:
        model = ListeningAttempt
        fields = ['id', 'test', 'answers', 'score', 'submitted_at']
        read_only_fields = ['score', 'submitted_at']