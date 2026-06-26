from rest_framework import serializers
from .models import WritingTest, WritingAttempt

class WritingTestSerializer(serializers.ModelSerializer):
    task1_image = serializers.SerializerMethodField()

    class Meta:
        model = WritingTest
        fields = ['id', 'title', 'task1_image',
                  'task1_question', 'task2_question']

    def get_task1_image(self, obj):
        if obj.task1_image:
            request = self.context.get('request')
            return request.build_absolute_uri(obj.task1_image.url)
        return None

class WritingAttemptSerializer(serializers.ModelSerializer):
    class Meta:
        model = WritingAttempt
        fields = ['id', 'test', 'task1_text', 'task2_text',
                  'teacher_score', 'teacher_feedback', 'submitted_at']
        read_only_fields = ['teacher_score', 'teacher_feedback', 'submitted_at']